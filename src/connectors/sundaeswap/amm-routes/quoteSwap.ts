import { BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { CardanoToken } from '#src/tokens/types';

import {
  QuoteSwapRequestType,
  QuoteSwapResponseType,
  QuoteSwapRequest,
  QuoteSwapResponse,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Sundaeswap } from '../sundaeswap';
import { formatTokenAmount } from '../sundaeswap.utils';

export async function quoteAmmSwap(
  sundaeswap: Sundaeswap,
  poolIdent: string,
  baseToken: CardanoToken,
  quoteToken: CardanoToken,
  amount: number, //  now always refers to BASE token units
  side: 'BUY' | 'SELL',
  slippagePct: number = 1,
): Promise<any> {
  // BUY: you want to RECEIVE `amount` of baseToken, paying quoteToken
  // SELL: you want to SPEND `amount` of baseToken, receiving quoteToken

  const poolData = await sundaeswap.getPoolData(poolIdent);

  // Get pool assets and reserves
  const assetA = poolData.assetA.assetId.trim();
  const assetB = poolData.assetB.assetId.trim();
  const reserveA = BigInt(poolData.liquidity.aReserve);
  const reserveB = BigInt(poolData.liquidity.bReserve);

  const exactIn = side === 'SELL';
  const [inputToken, outputToken] = exactIn ? [baseToken, quoteToken] : [quoteToken, baseToken];

  // Map input/output tokens to pool reserves
  const inputAssetId = inputToken.address || `${inputToken.policyId}.${inputToken.assetName}`;
  const outputAssetId = outputToken.address || `${outputToken.policyId}.${outputToken.assetName}`;

  let inputReserve: bigint;
  let outputReserve: bigint;

  if (inputAssetId.trim() === assetA) {
    inputReserve = reserveA;
    outputReserve = reserveB;
  } else if (inputAssetId.trim() === assetB) {
    inputReserve = reserveB;
    outputReserve = reserveA;
  } else {
    throw new Error(`Input token ${inputAssetId} not found in pool`);
  }

  // Validate output token is in the pool
  const outputInPool = outputAssetId.trim() === assetA || outputAssetId.trim() === assetB;
  if (!outputInPool) {
    throw new Error(`Output token ${outputAssetId} not found in pool`);
  }

  // Convert amount using BASE token decimals
  const fee = poolData.currentFee; // e.g., 0.005 for 0.5%
  let inputAmount: bigint;
  let outputAmount: bigint;

  if (exactIn) {
    // SELL: spending exact amount of baseToken
    inputAmount = BigInt(Math.floor(amount * 10 ** baseToken.decimals));

    // Apply AMM formula: dy = (y * dx * (1 - fee)) / (x + dx * (1 - fee))
    const inputAfterFee = (inputAmount * BigInt(Math.floor((1 - fee) * 10000))) / 10000n;
    outputAmount = (outputReserve * inputAfterFee) / (inputReserve + inputAfterFee);
  } else {
    // BUY: wanting to receive exact amount of baseToken
    outputAmount = BigInt(Math.floor(amount * 10 ** baseToken.decimals));

    // Check liquidity
    if (outputAmount >= outputReserve) {
      throw new Error('Insufficient liquidity: requested amount exceeds available reserves');
    }

    // Apply AMM formula: dx = (x * dy) / ((y - dy) * (1 - fee))
    const numerator = inputReserve * outputAmount;
    const denominator = ((outputReserve - outputAmount) * BigInt(Math.floor((1 - fee) * 10000))) / 10000n;
    inputAmount = numerator / denominator;
  }

  // Calculate slippage protection
  const slippageTolerance = slippagePct / 100;
  const slippageMultiplier = BigInt(Math.floor((1 - slippageTolerance) * 10000));
  const slippageDenominator = 10000n;

  const minAmountOut = exactIn ? (outputAmount * slippageMultiplier) / slippageDenominator : outputAmount;
  const maxAmountIn = exactIn
    ? inputAmount
    : (inputAmount * (slippageDenominator + BigInt(Math.floor(slippageTolerance * 10000)))) / slippageDenominator;

  // Calculate price impact
  const midPrice =
    Number(inputReserve) / 10 ** inputToken.decimals / (Number(outputReserve) / 10 ** outputToken.decimals);
  const executionPrice =
    Number(inputAmount) / 10 ** inputToken.decimals / (Number(outputAmount) / 10 ** outputToken.decimals);
  const priceImpact = Math.abs((executionPrice - midPrice) / midPrice);

  // Convert amounts to human-readable format
  const estimatedIn = formatTokenAmount(inputAmount, inputToken.decimals);
  const estimatedOut = formatTokenAmount(outputAmount, outputToken.decimals);
  const minOutHuman = formatTokenAmount(minAmountOut, outputToken.decimals);
  const maxInHuman = formatTokenAmount(maxAmountIn, inputToken.decimals);

  return {
    poolIdent,
    estimatedAmountIn: estimatedIn,
    estimatedAmountOut: estimatedOut,
    minAmountOut: minOutHuman,
    maxAmountIn: maxInHuman,
    priceImpact,
    inputToken,
    outputToken,
    rawAmountIn: inputAmount.toString(),
    rawAmountOut: outputAmount.toString(),
    rawMinAmountOut: minAmountOut.toString(),
    rawMaxAmountIn: maxAmountIn.toString(),
    slippagePct,
    pathAddresses: [inputToken.address, outputToken.address],
  };
}

// FIXED: Balance changes and response formatting
async function formatSwapQuote(
  fastify: FastifyInstance,
  network: string,
  poolIdent: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = 1,
): Promise<QuoteSwapResponseType> {
  logger.info(
    `formatSwapQuote: poolIdent=${poolIdent}, baseToken=${baseToken}, quoteToken=${quoteToken}, amount=${amount}, side=${side}, slippagePct=${slippagePct}, network=${network}`,
  );

  try {
    const { quote, sundaeswap, cardano, baseTokenObj, quoteTokenObj } = await getSundaeswapAmmQuote(
      fastify,
      network,
      poolIdent,
      baseToken,
      quoteToken,
      amount,
      side,
      slippagePct,
    );

    logger.info(
      `Quote result: estimatedAmountIn=${quote.estimatedAmountIn}, estimatedAmountOut=${quote.estimatedAmountOut}, slippagePct=${quote.slippagePct}`,
    );

    // Balance changes (match Uniswap logic)
    const baseTokenBalanceChange = side === 'BUY' ? quote.estimatedAmountOut : -quote.estimatedAmountIn;
    const quoteTokenBalanceChange = side === 'BUY' ? -quote.estimatedAmountIn : quote.estimatedAmountOut;

    logger.info(
      `Balance changes: baseTokenBalanceChange=${baseTokenBalanceChange}, quoteTokenBalanceChange=${quoteTokenBalanceChange}`,
    );

    // Calculate price
    const price =
      side === 'SELL'
        ? quote.estimatedAmountOut / quote.estimatedAmountIn
        : quote.estimatedAmountIn / quote.estimatedAmountOut;

    return {
      poolAddress: poolIdent,
      // Use correct token addresses like Uniswap
      tokenIn: quote.inputToken.address,
      tokenOut: quote.outputToken.address,
      amountIn: quote.estimatedAmountIn,
      amountOut: quote.estimatedAmountOut,
      price: price,
      minAmountOut: quote.minAmountOut,
      maxAmountIn: quote.maxAmountIn,
      slippagePct: quote.slippagePct,
      priceImpactPct: quote.priceImpact,
    };
  } catch (error) {
    logger.error(`Error formatting swap quote: ${error.message}`);
    if (error.stack) {
      logger.debug(`Stack trace: ${error.stack}`);
    }
    throw error;
  }
}

export async function getSundaeswapAmmQuote(
  _fastify: FastifyInstance,
  network: string,
  poolIdent: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = 1,
): Promise<{
  quote: any;
  sundaeswap: any;
  cardano: any;
  baseTokenObj: any;
  quoteTokenObj: any;
}> {
  // Get instances
  const sundaeswap = await Sundaeswap.getInstance(network);

  // Resolve tokens
  const baseTokenObj = sundaeswap.cardano.getTokenBySymbol(baseToken);
  const quoteTokenObj = sundaeswap.cardano.getTokenBySymbol(quoteToken);

  if (!baseTokenObj) {
    logger.error(`Base token not found: ${baseToken}`);
    throw new Error(`Base token not found: ${baseToken}`);
  }

  if (!quoteTokenObj) {
    logger.error(`Quote token not found: ${quoteToken}`);
    throw new Error(`Quote token not found: ${quoteToken}`);
  }

  logger.info(`Base token: ${baseTokenObj.symbol}, address=${baseTokenObj.address}, decimals=${baseTokenObj.decimals}`);
  logger.info(
    `Quote token: ${quoteTokenObj.symbol}, address=${quoteTokenObj.address}, decimals=${quoteTokenObj.decimals}`,
  );

  // Get the quote with slippage percentage
  const quote = await quoteAmmSwap(
    sundaeswap,
    poolIdent,
    baseTokenObj,
    quoteTokenObj,
    amount,
    side as 'BUY' | 'SELL',
    slippagePct,
  );

  if (!quote) {
    throw new Error('Failed to get swap quote');
  }

  return {
    quote,
    sundaeswap,
    cardano: sundaeswap.cardano,
    baseTokenObj,
    quoteTokenObj,
  };
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  // Import the httpErrors plugin to ensure it's available
  await fastify.register(require('@fastify/sensible'));

  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: QuoteSwapResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for Sundaeswap AMM',
        tags: ['/connector/sundaeswap/amm'],
        querystring: {
          ...QuoteSwapRequest,
          properties: {
            ...QuoteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            baseToken: { type: 'string', examples: ['SUNDAE'] },
            quoteToken: { type: 'string', examples: ['ADA'] },
            amount: { type: 'number', examples: [1000] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['BUY'] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: {
          200: {
            properties: {
              ...QuoteSwapResponse.properties,
            },
          },
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          poolAddress: requestedpoolIdent,
          baseToken,
          quoteToken,
          amount,
          side,
          slippagePct,
        } = request.query;

        const networkToUse = network || 'mainnet';
        const slippageToUse = slippagePct || 1; // Default to 1% if not provided

        const sundaeswap = await Sundaeswap.getInstance(networkToUse);
        let poolIdent = requestedpoolIdent;

        if (!poolIdent) {
          // Look up the pool from configuration pools dictionary
          poolIdent = await sundaeswap.findDefaultPool(baseToken, quoteToken, 'amm');

          if (!poolIdent) {
            throw fastify.httpErrors.notFound(`No AMM pool found for pair ${baseToken}-${quoteToken}`);
          }
        }

        return await formatSwapQuote(
          fastify,
          networkToUse,
          poolIdent,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippageToUse,
        );
      } catch (e) {
        logger.error(`Error in quote-swap route: ${e.message}`);

        // If it's already a Fastify HTTP error, re-throw it
        if (e.statusCode) {
          throw e;
        }

        // Check for specific error types
        if (e.message?.includes('Insufficient liquidity')) {
          throw fastify.httpErrors.badRequest(e.message);
        }
        if (e.message?.includes('Pool not found') || e.message?.includes('No AMM pool found')) {
          throw fastify.httpErrors.notFound(e.message);
        }
        if (e.message?.includes('token not found')) {
          throw fastify.httpErrors.badRequest(e.message);
        }

        // Default to internal server error with the actual error message
        throw fastify.httpErrors.internalServerError(`Error getting swap quote: ${e.message || 'Unknown error'}`);
      }
    },
  );
};

export default quoteSwapRoute;

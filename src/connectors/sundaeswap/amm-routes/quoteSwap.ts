import { BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { CardanoTokenInfo } from '../../../chains/cardano/cardano';
import {
  GetSwapQuoteResponseType,
  GetSwapQuoteResponse,
  GetSwapQuoteRequestType,
  GetSwapQuoteRequest,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
import { Sundaeswap } from '../sundaeswap';
import { formatTokenAmount } from '../sundaeswap.utils';

export async function quoteAmmSwap(
  sundaeswap: Sundaeswap,
  poolIdent: string,
  baseToken: CardanoTokenInfo,
  quoteToken: CardanoTokenInfo,
  amount: number, // now always refers to quote‐token units
  side: 'BUY' | 'SELL',
  slippagePct: number = 1, // Default to 1% if not provided
): Promise<any> {
  // BUY: you want to RECEIVE `amount` of quoteToken, paying baseToken
  // SELL: you want to SPEND `amount` of quoteToken, receiving baseToken
  const poolData = await sundaeswap.getPoolData(poolIdent);

  // Get pool assets and reserves
  const assetA = poolData.assetA.assetId.trim();
  const assetB = poolData.assetB.assetId.trim();
  const reserveA = BigInt(poolData.liquidity.aReserve);
  const reserveB = BigInt(poolData.liquidity.bReserve);

  // Determine which token corresponds to which asset in the pool
  const baseAssetId =
    baseToken.address || `${baseToken.policyId}.${baseToken.assetName}`;
  const quoteAssetId =
    quoteToken.address || `${quoteToken.policyId}.${quoteToken.assetName}`;

  let baseReserve: bigint;
  let quoteReserve: bigint;

  // Match tokens to pool reserves
  if (baseAssetId.trim() === assetA) {
    baseReserve = reserveA;
    quoteReserve = reserveB;
  } else if (baseAssetId.trim() === assetB) {
    baseReserve = reserveB;
    quoteReserve = reserveA;
  } else {
    throw new Error(`Base token ${baseAssetId} not found in pool`);
  }

  // Validate quote token is in the pool
  const quoteInPool =
    quoteAssetId.trim() === assetA || quoteAssetId.trim() === assetB;
  if (!quoteInPool) {
    throw new Error(`Quote token ${quoteAssetId} not found in pool`);
  }

  // Convert amount to smallest units
  const fee = poolData.currentFee; // e.g., 0.005 for 0.5%
  let inputAmount: bigint;
  let outputAmount: bigint;

  if (side === 'SELL') {
    // SELL: spending `amount` of quoteToken, receiving baseToken
    // This is exactIn scenario
    inputAmount = BigInt(Math.floor(amount * 10 ** quoteToken.decimals));

    // Apply AMM formula for sell (exactIn): dy = (y * dx * (1 - fee)) / (x + dx * (1 - fee))
    const inputAfterFee =
      (inputAmount * BigInt(Math.floor((1 - fee) * 10000))) / 10000n;
    outputAmount =
      (baseReserve * inputAfterFee) / (quoteReserve + inputAfterFee);
  } else {
    // BUY: wanting to receive `amount` of quoteToken, paying baseToken
    // This is exactOut scenario
    outputAmount = BigInt(Math.floor(amount * 10 ** quoteToken.decimals));

    // Check if we have enough liquidity
    if (outputAmount >= quoteReserve) {
      throw new Error(
        'Insufficient liquidity: requested amount exceeds available reserves',
      );
    }

    // Apply AMM formula for buy (exactOut): dx = (x * dy) / ((y - dy) * (1 - fee))
    const numerator = baseReserve * outputAmount;
    const denominator =
      ((quoteReserve - outputAmount) * BigInt(Math.floor((1 - fee) * 10000))) /
      10000n;
    inputAmount = numerator / denominator;
  }

  // Calculate slippage protection amounts
  const slippageTolerance = slippagePct / 100;
  const slippageMultiplier = BigInt(
    Math.floor((1 - slippageTolerance) * 10000),
  );
  const slippageDenominator = 10000n;

  const minAmountOut =
    side === 'SELL'
      ? (outputAmount * slippageMultiplier) / slippageDenominator
      : outputAmount;

  const maxAmountIn =
    side === 'BUY'
      ? (inputAmount *
          (slippageDenominator +
            BigInt(Math.floor(slippageTolerance * 10000)))) /
        slippageDenominator
      : inputAmount;

  // Calculate price impact
  const midPrice =
    Number(baseReserve) /
    10 ** baseToken.decimals /
    (Number(quoteReserve) / 10 ** quoteToken.decimals);

  const executionPrice =
    Number(inputAmount) /
    10 ** baseToken.decimals /
    (Number(outputAmount) / 10 ** quoteToken.decimals);

  const priceImpact = Math.abs((executionPrice - midPrice) / midPrice);

  // Determine which token is input and output based on side
  const inputToken = side === 'SELL' ? quoteToken : baseToken;
  const outputToken = side === 'SELL' ? baseToken : quoteToken;

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
    pathAddresses: [
      inputToken.address || `${inputToken.policyId}.${inputToken.assetName}`,
      outputToken.address || `${outputToken.policyId}.${outputToken.assetName}`,
    ],
  };
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

  logger.info(
    `Base token: ${baseTokenObj.symbol}, address=${baseTokenObj.address}, decimals=${baseTokenObj.decimals}`,
  );
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

async function formatSwapQuote(
  fastify: FastifyInstance,
  network: string,
  poolIdent: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = 1,
): Promise<GetSwapQuoteResponseType> {
  logger.info(
    `formatSwapQuote: poolIdent=${poolIdent}, baseToken=${baseToken}, quoteToken=${quoteToken}, amount=${amount}, side=${side}, slippagePct=${slippagePct}, network=${network}`,
  );

  try {
    // Use the extracted quote function with slippage percentage
    const { quote, sundaeswap, cardano, baseTokenObj, quoteTokenObj } =
      await getSundaeswapAmmQuote(
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

    // Calculate balance changes based on which tokens are being swapped
    const baseTokenBalanceChange =
      side === 'BUY' ? quote.estimatedAmountOut : -quote.estimatedAmountIn;
    const quoteTokenBalanceChange =
      side === 'BUY' ? -quote.estimatedAmountIn : quote.estimatedAmountOut;

    logger.info(
      `Balance changes: baseTokenBalanceChange=${baseTokenBalanceChange}, quoteTokenBalanceChange=${quoteTokenBalanceChange}`,
    );

    // Calculate price based on side
    // For SELL: price = quote received / base sold
    // For BUY: price = quote needed / base received
    const price =
      side === 'SELL'
        ? quote.estimatedAmountOut / quote.estimatedAmountIn
        : quote.estimatedAmountIn / quote.estimatedAmountOut;

    return {
      estimatedAmountIn: quote.estimatedAmountIn,
      estimatedAmountOut: quote.estimatedAmountOut,
      minAmountOut: quote.minAmountOut,
      maxAmountIn: quote.maxAmountIn,
      baseTokenBalanceChange,
      quoteTokenBalanceChange,
      price,
      gasPrice: 0,
      gasLimit: 0,
      gasCost: 0,
    };
  } catch (error) {
    logger.error(`Error formatting swap quote: ${error.message}`);
    if (error.stack) {
      logger.debug(`Stack trace: ${error.stack}`);
    }
    throw error;
  }
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  // Import the httpErrors plugin to ensure it's available
  await fastify.register(require('@fastify/sensible'));

  fastify.get<{
    Querystring: GetSwapQuoteRequestType;
    Reply: GetSwapQuoteResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for Sundaeswap AMM',
        tags: ['sundaeswap/amm'],
        querystring: {
          ...GetSwapQuoteRequest,
          properties: {
            ...GetSwapQuoteRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            baseToken: { type: 'string', examples: ['ADA'] },
            quoteToken: { type: 'string', examples: ['SUNDAE'] },
            amount: { type: 'number', examples: [0.001] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            poolIdent: { type: 'string', examples: [''] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: {
          200: {
            properties: {
              ...GetSwapQuoteResponse.properties,
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

        console.log('working upto here');
        const sundaeswap = await Sundaeswap.getInstance(networkToUse);
        let poolIdent = requestedpoolIdent;

        if (!poolIdent) {
          // Look up the pool from configuration pools dictionary
          poolIdent = await sundaeswap.findDefaultPool(
            baseToken,
            quoteToken,
            'amm',
          );

          if (!poolIdent) {
            throw fastify.httpErrors.notFound(
              `No AMM pool found for pair ${baseToken}-${quoteToken}`,
            );
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
        if (
          e.message?.includes('Pool not found') ||
          e.message?.includes('No AMM pool found')
        ) {
          throw fastify.httpErrors.notFound(e.message);
        }
        if (e.message?.includes('token not found')) {
          throw fastify.httpErrors.badRequest(e.message);
        }

        // Default to internal server error with the actual error message
        throw fastify.httpErrors.internalServerError(
          `Error getting swap quote: ${e.message || 'Unknown error'}`,
        );
      }
    },
  );
};

export default quoteSwapRoute;

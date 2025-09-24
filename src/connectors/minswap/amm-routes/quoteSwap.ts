import { Asset, calculateSwapExactIn, calculateSwapExactOut } from '@aiquant/minswap-sdk';
import { BN } from 'bn.js';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { CardanoToken } from '#src/tokens/types';

import { Cardano } from '../../../chains/cardano/cardano';
// NEW - v2.8 schema structure
import {
  QuoteSwapRequestType,
  QuoteSwapResponseType,
  QuoteSwapRequest,
  QuoteSwapResponse,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Minswap } from '../minswap';
import { formatTokenAmount } from '../minswap.utils';

async function quoteAmmSwap(
  minswap: Minswap,
  poolAddress: string,
  baseToken: CardanoToken,
  quoteToken: CardanoToken,
  amount: number, // now always refers to quote‐token units
  side: 'BUY' | 'SELL',
  slippagePct?: number,
): Promise<any> {
  // BUY: you want to RECEIVE `amount` of quoteToken, paying baseToken
  // SELL: you want to SPEND `amount` of quoteToken, receiving baseToken
  const exactIn = side === 'SELL';

  // Figure out which asset is input vs. output
  const inputToken = exactIn ? quoteToken : baseToken;
  const outputToken = exactIn ? baseToken : quoteToken;

  // FIXED: Convert `amount` to smallest‐unit based on what the amount represents
  // For BUY: amount = desired quoteToken amount (output)
  // For SELL: amount = available quoteToken amount (input)
  let amountInSmallestUnit: bigint;

  if (side === 'BUY') {
    // For BUY, amount represents the desired quoteToken (output), but we need exactOut calculation
    // So convert amount using quoteToken decimals
    amountInSmallestUnit = BigNumber.from(Math.floor(amount * 10 ** quoteToken.decimals)).toBigInt();
  } else {
    // For SELL, amount represents the quoteToken to spend (input)
    // So convert amount using quoteToken decimals
    amountInSmallestUnit = BigNumber.from(Math.floor(amount * 10 ** quoteToken.decimals)).toBigInt();
  }

  const { poolState, poolDatum } = await minswap.getPoolData(poolAddress);

  if (!poolState) throw new Error(`Pool not found for ${baseToken.symbol}-${quoteToken.symbol}`);

  // Figure out reserves & fee depending on input/output
  const idA = poolState.assetA;
  const idB = poolState.assetB;
  const assetIdIn = inputToken.symbol === 'ADA' ? 'lovelace' : inputToken.policyId + inputToken.assetName;
  let reserveIn: bigint, reserveOut: bigint;
  if (assetIdIn === idA) {
    reserveIn = poolState.reserveA;
    reserveOut = poolState.reserveB;
  } else if (assetIdIn === idB) {
    reserveIn = poolState.reserveB;
    reserveOut = poolState.reserveA;
  } else {
    throw new Error(`Input token not in pool`);
  }

  // Do the math
  let inputAmount: bigint, outputAmount: bigint, priceImpact: number;
  if (exactIn) {
    // SELL: spending exact amount of quoteToken
    inputAmount = amountInSmallestUnit;
    const { amountOut, priceImpact: pi } = calculateSwapExactIn({
      amountIn: inputAmount,
      reserveIn,
      reserveOut,
    });
    outputAmount = amountOut;
    priceImpact = pi.toNumber();
  } else {
    // BUY: want to receive exact amount of quoteToken
    outputAmount = amountInSmallestUnit;
    const { amountIn, priceImpact: pi } = calculateSwapExactOut({
      exactAmountOut: outputAmount,
      reserveIn,
      reserveOut,
    });
    inputAmount = amountIn;
    priceImpact = pi.toNumber();
  }

  const effectiveSlippage = slippagePct !== undefined ? slippagePct / 100 : minswap.getAllowedSlippage();

  const minAmountOut = exactIn
    ? new BN(outputAmount.toString()).mul(new BN(Math.floor((1 - effectiveSlippage) * 10000))).div(new BN(10000))
    : outputAmount;

  const maxAmountIn = exactIn
    ? inputAmount
    : new BN(inputAmount.toString()).mul(new BN(Math.floor((1 + effectiveSlippage) * 10000))).div(new BN(10000));

  // Format human‐readable
  const estimatedIn = formatTokenAmount(inputAmount.toString(), inputToken.decimals);
  const estimatedOut = formatTokenAmount(outputAmount.toString(), outputToken.decimals);
  const minOutHuman = formatTokenAmount(minAmountOut.toString(), outputToken.decimals);
  const maxInHuman = formatTokenAmount(maxAmountIn.toString(), inputToken.decimals);

  return {
    poolAddress,
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
    pathAddresses: [
      inputToken.address || `${inputToken.policyId}.${inputToken.assetName}`,
      outputToken.address || `${outputToken.policyId}.${outputToken.assetName}`,
    ],
  };
}

export async function getMinswapAmmQuote(
  _fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
): Promise<{
  quote: any;
  minswap: any;
  cardano: any;
  baseTokenObj: any;
  quoteTokenObj: any;
}> {
  // Get instances
  const minswap = await Minswap.getInstance(network);
  const cardano = await Cardano.getInstance(network);

  if (!cardano.ready()) {
    logger.info('Cardano instance not ready, initializing...');
    await cardano.init();
  }

  // Resolve tokens
  const baseTokenObj = cardano.getTokenBySymbol(baseToken);
  const quoteTokenObj = cardano.getTokenBySymbol(quoteToken);

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

  // Get the quote
  const quote = await quoteAmmSwap(
    minswap,
    poolAddress,
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
    minswap,
    cardano,
    baseTokenObj,
    quoteTokenObj,
  };
}

async function formatSwapQuote(
  fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
): Promise<QuoteSwapResponseType> {
  logger.info(
    `formatSwapQuote: poolAddress=${poolAddress}, baseToken=${baseToken}, quoteToken=${quoteToken}, amount=${amount}, side=${side}, network=${network}`,
  );

  try {
    // Use the extracted quote function
    const { quote, minswap, cardano, baseTokenObj, quoteTokenObj } = await getMinswapAmmQuote(
      fastify,
      network,
      poolAddress,
      baseToken,
      quoteToken,
      amount,
      side,
      slippagePct,
    );

    logger.info(
      `Quote result: estimatedAmountIn=${quote.estimatedAmountIn}, estimatedAmountOut=${quote.estimatedAmountOut}`,
    );

    // Calculate balance changes based on which tokens are being swapped
    // The quote object tells us which token is input and which is output
    let baseTokenBalanceChange: number;
    let quoteTokenBalanceChange: number;

    if (side === 'SELL') {
      // SELL: spending quoteToken, receiving baseToken
      // Input token is quoteToken, output token is baseToken
      baseTokenBalanceChange = quote.estimatedAmountOut; // positive (receiving)
      quoteTokenBalanceChange = -quote.estimatedAmountIn; // negative (spending)
    } else {
      // BUY: spending baseToken, receiving quoteToken
      // Input token is baseToken, output token is quoteToken
      baseTokenBalanceChange = -quote.estimatedAmountIn; // negative (spending)
      quoteTokenBalanceChange = quote.estimatedAmountOut; // positive (receiving)
    }

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
      // Base QuoteSwapResponse fields (matching Uniswap structure)
      poolAddress,
      tokenIn: quote.inputToken.address || `${quote.inputToken.policyId}.${quote.inputToken.assetName}`,
      tokenOut: quote.outputToken.address || `${quote.outputToken.policyId}.${quote.outputToken.assetName}`,
      amountIn: quote.estimatedAmountIn,
      amountOut: quote.estimatedAmountOut,
      price,
      slippagePct: slippagePct || 1,
      minAmountOut: quote.minAmountOut,
      maxAmountIn: quote.maxAmountIn,
      // AMM-specific fields
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
        description: 'Get swap quote for Minswap AMM',
        tags: ['minswap/amm'],
        querystring: {
          ...QuoteSwapRequest,
          properties: {
            ...QuoteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            baseToken: { type: 'string', examples: ['ADA'] },
            quoteToken: { type: 'string', examples: ['MIN'] },
            amount: { type: 'number', examples: [0.001] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            poolAddress: { type: 'string', examples: [''] },
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
          poolAddress: requestedPoolAddress,
          baseToken,
          quoteToken,
          amount,
          side,
          slippagePct,
        } = request.query;

        const networkToUse = network || 'mainnet';

        const minswap = await Minswap.getInstance(networkToUse);
        let poolAddress = requestedPoolAddress;

        if (!poolAddress) {
          // Look up the pool from configuration pools dictionary
          poolAddress = await minswap.findDefaultPool(baseToken, quoteToken, 'amm');

          if (!poolAddress) {
            throw fastify.httpErrors.notFound(`No AMM pool found for pair ${baseToken}-${quoteToken}`);
          }
        }

        return await formatSwapQuote(
          fastify,
          networkToUse,
          poolAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
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

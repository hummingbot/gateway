import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { QuotePositionResponse, QuotePositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import { PancakeswapSolConfig } from '../pancakeswap-sol.config';
import {
  getLiquidityFromAmounts,
  getLiquidityFromSingleAmount,
  getAmountsFromLiquidity,
} from '../pancakeswap-sol.math';
import { priceToTick, roundTickToSpacing, tickToPrice } from '../pancakeswap-sol.parser';
import { PancakeswapSolClmmQuotePositionRequest } from '../schemas';

/**
 * Quote position with proper CLMM math
 * Calculates token amounts needed for a position based on price range and current price
 */
async function quotePosition(
  _fastify: FastifyInstance,
  network: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct?: number,
): Promise<QuotePositionResponseType> {
  const solana = await Solana.getInstance(network);
  const pancakeswapSol = await PancakeswapSol.getInstance(network);

  // Get pool info to get current price and tick spacing
  const poolInfo = await pancakeswapSol.getClmmPoolInfo(poolAddress);
  if (!poolInfo) {
    throw _fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  const currentPrice = poolInfo.price;
  const tickSpacing = poolInfo.binStep; // binStep is the tick spacing

  // Validate price range
  if (lowerPrice >= upperPrice) {
    throw _fastify.httpErrors.badRequest('Lower price must be less than upper price');
  }

  // Get token info for decimals
  const baseToken = await solana.getToken(poolInfo.baseTokenAddress);
  const quoteToken = await solana.getToken(poolInfo.quoteTokenAddress);

  if (!baseToken || !quoteToken) {
    throw _fastify.httpErrors.notFound('Token information not found');
  }

  // Calculate decimal difference for tick conversions
  const decimalDiff = baseToken.decimals - quoteToken.decimals;

  // Convert prices to ticks and round to valid tick spacing
  // This ensures we use tick-aligned prices like the PancakeSwap website
  const lowerTick = roundTickToSpacing(priceToTick(lowerPrice, decimalDiff), tickSpacing);
  const upperTick = roundTickToSpacing(priceToTick(upperPrice, decimalDiff), tickSpacing);

  // Convert ticks back to actual prices (tick-aligned)
  const tickAlignedLowerPrice = tickToPrice(lowerTick, decimalDiff);
  const tickAlignedUpperPrice = tickToPrice(upperTick, decimalDiff);

  logger.info(`Input prices: ${lowerPrice}-${upperPrice}`);
  logger.info(`Tick-aligned prices: ${tickAlignedLowerPrice}-${tickAlignedUpperPrice}`);
  logger.info(`Ticks: ${lowerTick}-${upperTick} (spacing: ${tickSpacing})`);

  // Use tick-aligned prices for calculations
  const effectiveLowerPrice = tickAlignedLowerPrice;
  const effectiveUpperPrice = tickAlignedUpperPrice;

  let liquidity;
  let baseLimited = false;
  let calculatedBaseAmount = 0;
  let calculatedQuoteAmount = 0;

  // Determine position type based on price range (use tick-aligned prices)
  const priceAboveRange = currentPrice >= effectiveUpperPrice;
  const priceBelowRange = currentPrice < effectiveLowerPrice;

  if (baseTokenAmount && !quoteTokenAmount) {
    // User specified only base amount
    const effectiveBaseAmount = baseTokenAmount;

    // If price is below range, position needs only quote token
    // Convert base amount to quote equivalent
    if (priceBelowRange) {
      const quoteEquivalent = baseTokenAmount * currentPrice;
      liquidity = getLiquidityFromSingleAmount(
        currentPrice,
        effectiveLowerPrice,
        effectiveUpperPrice,
        quoteEquivalent,
        quoteToken.decimals,
        false, // use quote token
        baseToken.decimals,
        quoteToken.decimals,
      );
      baseLimited = false; // quote token is the limiting factor
    } else {
      // Price in range or above range - use base token directly
      liquidity = getLiquidityFromSingleAmount(
        currentPrice,
        effectiveLowerPrice,
        effectiveUpperPrice,
        effectiveBaseAmount,
        baseToken.decimals,
        true, // isToken0 (base)
        baseToken.decimals,
        quoteToken.decimals,
      );
      baseLimited = true;
    }

    // Calculate both amounts from liquidity
    const amounts = getAmountsFromLiquidity(
      currentPrice,
      effectiveLowerPrice,
      effectiveUpperPrice,
      liquidity,
      baseToken.decimals,
      quoteToken.decimals,
    );

    calculatedBaseAmount = amounts.amount0;
    calculatedQuoteAmount = amounts.amount1;
  } else if (quoteTokenAmount && !baseTokenAmount) {
    // User specified only quote amount
    const effectiveQuoteAmount = quoteTokenAmount;

    // If price is above range, position needs only base token
    // Convert quote amount to base equivalent
    if (priceAboveRange) {
      const baseEquivalent = quoteTokenAmount / currentPrice;
      liquidity = getLiquidityFromSingleAmount(
        currentPrice,
        effectiveLowerPrice,
        effectiveUpperPrice,
        baseEquivalent,
        baseToken.decimals,
        true, // use base token
        baseToken.decimals,
        quoteToken.decimals,
      );
      baseLimited = true; // base token is the limiting factor
    } else {
      // Price in range or below range - use quote token directly
      liquidity = getLiquidityFromSingleAmount(
        currentPrice,
        effectiveLowerPrice,
        effectiveUpperPrice,
        effectiveQuoteAmount,
        quoteToken.decimals,
        false, // isToken1 (quote)
        baseToken.decimals,
        quoteToken.decimals,
      );
      baseLimited = false;
    }

    // Calculate both amounts from liquidity
    const amounts = getAmountsFromLiquidity(
      currentPrice,
      effectiveLowerPrice,
      effectiveUpperPrice,
      liquidity,
      baseToken.decimals,
      quoteToken.decimals,
    );

    calculatedBaseAmount = amounts.amount0;
    calculatedQuoteAmount = amounts.amount1;
  } else if (baseTokenAmount && quoteTokenAmount) {
    // Both specified - handle based on price range
    let liquidityFromBase;
    let liquidityFromQuote;

    if (priceBelowRange) {
      // Price below range - only quote token matters
      // Convert base to quote equivalent and add to provided quote amount
      const baseAsQuote = baseTokenAmount * currentPrice;
      const totalQuote = quoteTokenAmount + baseAsQuote;
      liquidity = getLiquidityFromSingleAmount(
        currentPrice,
        effectiveLowerPrice,
        effectiveUpperPrice,
        totalQuote,
        quoteToken.decimals,
        false,
        baseToken.decimals,
        quoteToken.decimals,
      );
      baseLimited = false;
    } else if (priceAboveRange) {
      // Price above range - only base token matters
      // Convert quote to base equivalent and add to provided base amount
      const quoteAsBase = quoteTokenAmount / currentPrice;
      const totalBase = baseTokenAmount + quoteAsBase;
      liquidity = getLiquidityFromSingleAmount(
        currentPrice,
        effectiveLowerPrice,
        effectiveUpperPrice,
        totalBase,
        baseToken.decimals,
        true,
        baseToken.decimals,
        quoteToken.decimals,
      );
      baseLimited = true;
    } else {
      // Price in range - calculate liquidity from each and use the minimum (limiting factor)
      liquidityFromBase = getLiquidityFromSingleAmount(
        currentPrice,
        effectiveLowerPrice,
        effectiveUpperPrice,
        baseTokenAmount,
        baseToken.decimals,
        true,
        baseToken.decimals,
        quoteToken.decimals,
      );

      liquidityFromQuote = getLiquidityFromSingleAmount(
        currentPrice,
        effectiveLowerPrice,
        effectiveUpperPrice,
        quoteTokenAmount,
        quoteToken.decimals,
        false,
        baseToken.decimals,
        quoteToken.decimals,
      );

      // Use the smaller liquidity (limiting factor)
      if (liquidityFromBase.lt(liquidityFromQuote)) {
        baseLimited = true;
        liquidity = liquidityFromBase;
      } else {
        baseLimited = false;
        liquidity = liquidityFromQuote;
      }
    }

    // Calculate actual amounts from the limiting liquidity
    const amounts = getAmountsFromLiquidity(
      currentPrice,
      effectiveLowerPrice,
      effectiveUpperPrice,
      liquidity,
      baseToken.decimals,
      quoteToken.decimals,
    );

    calculatedBaseAmount = amounts.amount0;
    calculatedQuoteAmount = amounts.amount1;
  } else {
    throw _fastify.httpErrors.badRequest('Must specify baseTokenAmount or quoteTokenAmount');
  }

  logger.info(
    `Quote position for pool ${poolAddress}: ${calculatedBaseAmount.toFixed(6)} base (${baseToken.symbol}), ${calculatedQuoteAmount.toFixed(6)} quote (${quoteToken.symbol})`,
  );
  logger.info(
    `Current price: ${currentPrice.toFixed(6)}, Tick-aligned range: ${tickAlignedLowerPrice.toFixed(6)}-${tickAlignedUpperPrice.toFixed(6)}`,
  );
  logger.info(`Liquidity: ${liquidity.toString()}, Base limited: ${baseLimited}`);

  // Apply slippage to calculate max amounts
  // User amounts are the quoted amounts, max allows for slippage tolerance
  const effectiveSlippage = slippagePct ?? PancakeswapSolConfig.config.slippagePct;
  const slippageMultiplier = 1 + effectiveSlippage / 100;

  // Return quote with calculated amounts
  return {
    baseLimited,
    baseTokenAmount: calculatedBaseAmount,
    quoteTokenAmount: calculatedQuoteAmount,
    baseTokenAmountMax: calculatedBaseAmount * slippageMultiplier,
    quoteTokenAmountMax: calculatedQuoteAmount * slippageMultiplier,
    liquidity: liquidity.toString(),
  };
}

export { quotePosition };

export const quotePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof PancakeswapSolClmmQuotePositionRequest>;
    Reply: QuotePositionResponseType;
  }>(
    '/quote-position',
    {
      schema: {
        description: 'Quote position amounts for PancakeSwap Solana CLMM (simplified)',
        tags: ['/connector/pancakeswap-sol'],
        querystring: PancakeswapSolClmmQuotePositionRequest,
        response: {
          200: QuotePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network = 'mainnet-beta',
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        } = request.query;

        return await quotePosition(
          fastify,
          network,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );
      } catch (e: any) {
        logger.error('Quote position error:', e);
        // Re-throw httpErrors as-is
        if (e.statusCode) {
          throw e;
        }
        // Handle unknown errors
        const errorMessage = e.message || 'Failed to quote position';
        throw fastify.httpErrors.internalServerError(errorMessage);
      }
    },
  );
};

export default quotePositionRoute;

import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { QuotePositionResponseType, QuotePositionResponse } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { OrcaClmmQuotePositionRequest } from '../schemas';

/**
 * Convert price to tick index
 * Formula: tick = log(price) / log(1.0001)
 */
function priceToTick(price: number): number {
  return Math.floor(Math.log(price) / Math.log(1.0001));
}

/**
 * Convert tick to price
 * Formula: price = 1.0001^tick
 */
function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

/**
 * Calculate liquidity from token amounts for a concentrated liquidity position
 * Simplified calculation based on Uniswap v3 math
 */
function calculateLiquidityFromAmounts(
  currentPrice: number,
  lowerPrice: number,
  upperPrice: number,
  baseTokenAmount: number,
  quoteTokenAmount: number,
): { liquidity: number; adjustedBaseAmount: number; adjustedQuoteAmount: number } {
  const sqrtCurrentPrice = Math.sqrt(currentPrice);
  const sqrtLowerPrice = Math.sqrt(lowerPrice);
  const sqrtUpperPrice = Math.sqrt(upperPrice);

  let liquidity: number;
  let adjustedBaseAmount = baseTokenAmount;
  let adjustedQuoteAmount = quoteTokenAmount;

  if (currentPrice <= lowerPrice) {
    // Position is entirely in token B (quote)
    // L = ΔB / (1/√Pa - 1/√Pb)
    liquidity = quoteTokenAmount / (1 / sqrtLowerPrice - 1 / sqrtUpperPrice);
    adjustedBaseAmount = 0;
  } else if (currentPrice >= upperPrice) {
    // Position is entirely in token A (base)
    // L = ΔA / (√Pb - √Pa)
    liquidity = baseTokenAmount / (sqrtUpperPrice - sqrtLowerPrice);
    adjustedQuoteAmount = 0;
  } else {
    // Position spans current price
    // Calculate liquidity from both amounts and use the minimum
    const liquidityFromBase = baseTokenAmount / (sqrtCurrentPrice - sqrtLowerPrice);
    const liquidityFromQuote = quoteTokenAmount / (1 / sqrtCurrentPrice - 1 / sqrtUpperPrice);

    liquidity = Math.min(liquidityFromBase, liquidityFromQuote);

    // Recalculate actual amounts needed with this liquidity
    adjustedBaseAmount = liquidity * (sqrtCurrentPrice - sqrtLowerPrice);
    adjustedQuoteAmount = liquidity * (1 / sqrtCurrentPrice - 1 / sqrtUpperPrice);
  }

  return { liquidity, adjustedBaseAmount, adjustedQuoteAmount };
}

export async function quotePosition(
  fastify: FastifyInstance,
  network: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct: number = 1,
): Promise<QuotePositionResponseType> {
  const orca = await Orca.getInstance(network);
  const solana = await Solana.getInstance(network);

  // Get pool info
  const poolInfo = await orca.getPoolInfo(poolAddress);
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  // Validate price range
  if (lowerPrice >= upperPrice) {
    throw fastify.httpErrors.badRequest('lowerPrice must be less than upperPrice');
  }

  if (lowerPrice <= 0 || upperPrice <= 0) {
    throw fastify.httpErrors.badRequest('Prices must be positive');
  }

  // Get token info
  const baseTokenInfo = await solana.getToken(poolInfo.baseTokenAddress);
  const quoteTokenInfo = await solana.getToken(poolInfo.quoteTokenAddress);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.internalServerError('Failed to fetch token info');
  }

  // If neither amount is specified, return an error
  if (!baseTokenAmount && !quoteTokenAmount) {
    throw fastify.httpErrors.badRequest('At least one of baseTokenAmount or quoteTokenAmount must be specified');
  }

  // If only one amount is specified, estimate the other based on price range
  let baseAmount = baseTokenAmount || 0;
  let quoteAmount = quoteTokenAmount || 0;

  if (!baseTokenAmount && quoteTokenAmount) {
    // Estimate base amount needed
    const midPrice = (lowerPrice + upperPrice) / 2;
    baseAmount = quoteTokenAmount / midPrice;
  } else if (baseTokenAmount && !quoteTokenAmount) {
    // Estimate quote amount needed
    const midPrice = (lowerPrice + upperPrice) / 2;
    quoteAmount = baseTokenAmount * midPrice;
  }

  // Calculate liquidity and adjusted amounts
  const { liquidity, adjustedBaseAmount, adjustedQuoteAmount } = calculateLiquidityFromAmounts(
    poolInfo.price,
    lowerPrice,
    upperPrice,
    baseAmount,
    quoteAmount,
  );

  // Convert prices to ticks
  const lowerTick = priceToTick(lowerPrice);
  const upperTick = priceToTick(upperPrice);

  // Apply slippage to max amounts
  const maxBaseTokenAmount = adjustedBaseAmount * (1 + slippagePct / 100);
  const maxQuoteTokenAmount = adjustedQuoteAmount * (1 + slippagePct / 100);

  logger.info(
    `Quote position for pool ${poolAddress}: price range [${lowerPrice}, ${upperPrice}], ` +
      `tick range [${lowerTick}, ${upperTick}], liquidity ${liquidity.toFixed(2)}`,
  );

  return {
    baseLimited: adjustedBaseAmount < adjustedQuoteAmount * poolInfo.price,
    baseTokenAmount: adjustedBaseAmount,
    quoteTokenAmount: adjustedQuoteAmount,
    baseTokenAmountMax: maxBaseTokenAmount,
    quoteTokenAmountMax: maxQuoteTokenAmount,
    liquidity,
  };
}

export const quotePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof OrcaClmmQuotePositionRequest>;
    Reply: QuotePositionResponseType;
  }>(
    '/quote-position',
    {
      schema: {
        description: 'Quote amounts for a new Orca CLMM position',
        tags: ['/connector/orca'],
        querystring: OrcaClmmQuotePositionRequest,
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
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to quote position');
      }
    },
  );
};

export default quotePositionRoute;

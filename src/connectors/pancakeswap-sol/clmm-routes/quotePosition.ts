import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { QuotePositionResponse, QuotePositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { getLiquidityFromAmounts } from '../pancakeswap-clmm-math';
import { PancakeswapSol } from '../pancakeswap-sol';
import { PancakeswapSolClmmQuotePositionRequest } from '../schemas';

/**
 * Simplified position quoting - calculates token amounts based on current pool price
 * This is a simplified version that doesn't use tick math or Raydium SDK
 */
async function quotePosition(
  _fastify: FastifyInstance,
  network: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
): Promise<QuotePositionResponseType> {
  const solana = await Solana.getInstance(network);
  const pancakeswapSol = await PancakeswapSol.getInstance(network);

  // Get pool info to get current price
  const poolInfo = await pancakeswapSol.getClmmPoolInfo(poolAddress);
  if (!poolInfo) {
    throw _fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  const currentPrice = poolInfo.price;

  // Validate price range
  if (lowerPrice >= upperPrice) {
    throw _fastify.httpErrors.badRequest('Lower price must be less than upper price');
  }

  // Determine which amount to use as base
  let baseLimited = false;
  let calculatedBaseAmount = 0;
  let calculatedQuoteAmount = 0;

  if (baseTokenAmount && !quoteTokenAmount) {
    // User specified base amount, calculate quote
    baseLimited = true;
    calculatedBaseAmount = baseTokenAmount;

    // Simplified: assume position will be at current price
    // In reality, liquidity distribution depends on price range
    if (currentPrice >= lowerPrice && currentPrice <= upperPrice) {
      // Price is in range - need both tokens
      calculatedQuoteAmount = baseTokenAmount * currentPrice;
    } else if (currentPrice < lowerPrice) {
      // Price below range - position will be all quote token
      calculatedQuoteAmount = baseTokenAmount * lowerPrice;
    } else {
      // Price above range - position will be all base token
      calculatedQuoteAmount = 0;
    }
  } else if (quoteTokenAmount && !baseTokenAmount) {
    // User specified quote amount, calculate base
    baseLimited = false;
    calculatedQuoteAmount = quoteTokenAmount;

    if (currentPrice >= lowerPrice && currentPrice <= upperPrice) {
      calculatedBaseAmount = quoteTokenAmount / currentPrice;
    } else if (currentPrice < lowerPrice) {
      calculatedBaseAmount = 0;
    } else {
      calculatedBaseAmount = quoteTokenAmount / upperPrice;
    }
  } else if (baseTokenAmount && quoteTokenAmount) {
    // Both specified - use the smaller ratio
    const baseRatio = baseTokenAmount;
    const quoteRatio = quoteTokenAmount / currentPrice;

    baseLimited = baseRatio < quoteRatio;
    if (baseLimited) {
      calculatedBaseAmount = baseTokenAmount;
      calculatedQuoteAmount = baseTokenAmount * currentPrice;
    } else {
      calculatedBaseAmount = quoteTokenAmount / currentPrice;
      calculatedQuoteAmount = quoteTokenAmount;
    }
  } else {
    throw _fastify.httpErrors.badRequest('Must specify baseTokenAmount or quoteTokenAmount');
  }

  logger.info(
    `Quote position for pool ${poolAddress}: ${calculatedBaseAmount.toFixed(4)} base, ${calculatedQuoteAmount.toFixed(4)} quote`,
  );

  // Get token info for decimals
  const baseToken = await solana.getToken(poolInfo.baseTokenAddress);
  const quoteToken = await solana.getToken(poolInfo.quoteTokenAddress);

  if (!baseToken || !quoteToken) {
    throw _fastify.httpErrors.notFound('Token information not found');
  }

  // Calculate actual liquidity using CLMM math
  const liquidity = getLiquidityFromAmounts(
    currentPrice,
    lowerPrice,
    upperPrice,
    calculatedBaseAmount,
    calculatedQuoteAmount,
    baseToken.decimals,
    quoteToken.decimals,
  );

  logger.info(`Calculated liquidity: ${liquidity.toString()}`);

  // Return quote with actual liquidity
  return {
    baseLimited,
    baseTokenAmount: calculatedBaseAmount,
    quoteTokenAmount: calculatedQuoteAmount,
    baseTokenAmountMax: calculatedBaseAmount * 1.01, // 1% slippage buffer
    quoteTokenAmountMax: calculatedQuoteAmount * 1.01,
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
        } = request.query;

        return await quotePosition(
          fastify,
          network,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
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

import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { QuotePositionResponse, QuotePositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import {
  getLiquidityFromAmounts,
  getLiquidityFromSingleAmount,
  getAmountsFromLiquidity,
} from '../pancakeswap-sol.math';
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

  // Get token info for decimals
  const baseToken = await solana.getToken(poolInfo.baseTokenAddress);
  const quoteToken = await solana.getToken(poolInfo.quoteTokenAddress);

  if (!baseToken || !quoteToken) {
    throw _fastify.httpErrors.notFound('Token information not found');
  }

  let liquidity;
  let baseLimited = false;
  let calculatedBaseAmount = 0;
  let calculatedQuoteAmount = 0;

  if (baseTokenAmount && !quoteTokenAmount) {
    // User specified only base amount - calculate liquidity from it
    baseLimited = true;
    liquidity = getLiquidityFromSingleAmount(
      currentPrice,
      lowerPrice,
      upperPrice,
      baseTokenAmount,
      baseToken.decimals,
      true, // isToken0 (base)
      baseToken.decimals,
      quoteToken.decimals,
    );

    // Calculate both amounts from liquidity
    const amounts = getAmountsFromLiquidity(
      currentPrice,
      lowerPrice,
      upperPrice,
      liquidity,
      baseToken.decimals,
      quoteToken.decimals,
    );

    calculatedBaseAmount = amounts.amount0;
    calculatedQuoteAmount = amounts.amount1;
  } else if (quoteTokenAmount && !baseTokenAmount) {
    // User specified only quote amount - calculate liquidity from it
    baseLimited = false;
    liquidity = getLiquidityFromSingleAmount(
      currentPrice,
      lowerPrice,
      upperPrice,
      quoteTokenAmount,
      quoteToken.decimals,
      false, // isToken1 (quote)
      baseToken.decimals,
      quoteToken.decimals,
    );

    // Calculate both amounts from liquidity
    const amounts = getAmountsFromLiquidity(
      currentPrice,
      lowerPrice,
      upperPrice,
      liquidity,
      baseToken.decimals,
      quoteToken.decimals,
    );

    calculatedBaseAmount = amounts.amount0;
    calculatedQuoteAmount = amounts.amount1;
  } else if (baseTokenAmount && quoteTokenAmount) {
    // Both specified - calculate liquidity from each and use the minimum (limiting factor)
    const liquidityFromBase = getLiquidityFromSingleAmount(
      currentPrice,
      lowerPrice,
      upperPrice,
      baseTokenAmount,
      baseToken.decimals,
      true,
      baseToken.decimals,
      quoteToken.decimals,
    );

    const liquidityFromQuote = getLiquidityFromSingleAmount(
      currentPrice,
      lowerPrice,
      upperPrice,
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

    // Calculate actual amounts from the limiting liquidity
    const amounts = getAmountsFromLiquidity(
      currentPrice,
      lowerPrice,
      upperPrice,
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
  logger.info(`Current price: ${currentPrice.toFixed(6)}, Range: ${lowerPrice}-${upperPrice}`);
  logger.info(`Liquidity: ${liquidity.toString()}, Base limited: ${baseLimited}`);

  // Return quote with calculated amounts
  return {
    baseLimited,
    baseTokenAmount: calculatedBaseAmount,
    quoteTokenAmount: calculatedQuoteAmount,
    baseTokenAmountMax: calculatedBaseAmount * 1.01, // 1% buffer for precision
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

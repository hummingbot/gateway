import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { QuoteSwapResponseType, QuoteSwapResponse } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import { PancakeswapSolClmmQuoteSwapRequest, PancakeswapSolClmmQuoteSwapRequestType } from '../schemas';

/**
 * IMPORTANT: This is a SIMPLIFIED quote implementation that uses current pool price.
 *
 * Limitations:
 * - Does NOT account for price impact across ticks
 * - Does NOT use actual tick array data for precise calculations
 * - Does NOT calculate real slippage based on pool depth
 * - Uses spot price from pool, not execution price
 *
 * For production use, this should be replaced with a full implementation using:
 * - Tick array fetching and processing
 * - Concentrated liquidity math (similar to Raydium SDK)
 * - Proper price impact calculation based on available liquidity
 */
async function quoteSwap(
  _fastify: FastifyInstance,
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress?: string,
  slippagePct?: number,
): Promise<QuoteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const pancakeswapSol = await PancakeswapSol.getInstance(network);

  // Get token info
  const baseToken = await solana.getToken(baseTokenSymbol);
  const quoteToken = await solana.getToken(quoteTokenSymbol);

  if (!baseToken || !quoteToken) {
    throw _fastify.httpErrors.notFound(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
  }

  // If no pool address provided, try to find it from pool service
  let poolAddressToUse = poolAddress;
  if (!poolAddressToUse) {
    const { PoolService } = await import('../../../services/pool-service');
    const poolService = PoolService.getInstance();

    const pool = await poolService.getPool('pancakeswap-sol', network, 'clmm', baseToken.symbol, quoteToken.symbol);

    if (!pool) {
      throw _fastify.httpErrors.notFound(`No CLMM pool found for ${baseToken.symbol}-${quoteToken.symbol}`);
    }

    poolAddressToUse = pool.address;
  }

  // Get pool info
  const poolInfo = await pancakeswapSol.getClmmPoolInfo(poolAddressToUse);
  if (!poolInfo) {
    throw _fastify.httpErrors.notFound(`Pool not found: ${poolAddressToUse}`);
  }

  // Determine if baseToken matches pool's base or quote
  const isBaseTokenFirst = poolInfo.baseTokenAddress === baseToken.address;
  const currentPrice = isBaseTokenFirst ? poolInfo.price : 1 / poolInfo.price;

  const effectiveSlippage = slippagePct ?? 1.0; // Default 1% slippage

  let amountIn: number;
  let amountOut: number;
  let minAmountOut: number;
  let maxAmountIn: number;
  let price: number;

  if (side === 'SELL') {
    // Selling base token for quote token
    amountIn = amount;
    amountOut = amount * currentPrice;
    minAmountOut = amountOut * (1 - effectiveSlippage / 100);
    maxAmountIn = amountIn;
    price = currentPrice;
  } else {
    // Buying base token with quote token
    amountOut = amount;
    amountIn = amount * currentPrice;
    minAmountOut = amountOut;
    maxAmountIn = amountIn * (1 + effectiveSlippage / 100);
    price = currentPrice;
  }

  const result: QuoteSwapResponseType = {
    poolAddress: poolAddressToUse,
    tokenIn: side === 'SELL' ? baseToken.address : quoteToken.address,
    tokenOut: side === 'SELL' ? quoteToken.address : baseToken.address,
    amountIn,
    amountOut,
    price,
    slippagePct: effectiveSlippage,
    minAmountOut,
    maxAmountIn,
    priceImpactPct: 0, // Cannot calculate without tick array data
  };

  logger.info(
    `PancakeSwap CLMM quote: ${side} ${amount} ${baseTokenSymbol}/${quoteTokenSymbol} - Price: ${price.toFixed(6)}`,
  );
  logger.warn('Using simplified quote calculation - does not account for price impact or tick liquidity');

  return result;
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: PancakeswapSolClmmQuoteSwapRequestType;
    Reply: QuoteSwapResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description:
          'Get swap quote for PancakeSwap Solana CLMM (simplified - uses spot price without tick calculations)',
        tags: ['/connector/pancakeswap-sol'],
        querystring: PancakeswapSolClmmQuoteSwapRequest,
        response: { 200: QuoteSwapResponse },
      },
    },
    async (request) => {
      try {
        const { network, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.query;

        return await quoteSwap(fastify, network, baseToken, quoteToken, amount, side, poolAddress, slippagePct);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to get swap quote');
      }
    },
  );
};

export default quoteSwapRoute;

import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { QuoteSwapResponseType, QuoteSwapResponse } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import { PancakeswapSolConfig } from '../pancakeswap-sol.config';
import { PancakeswapSolClmmQuoteSwapRequest, PancakeswapSolClmmQuoteSwapRequestType } from '../schemas';

/**
 * Quote swap implementation using pool data with fee and price impact estimation.
 *
 * Features:
 * - Uses actual pool fee from AMM config
 * - Estimates price impact based on swap amount vs pool liquidity
 * - Accounts for fee deduction from output amount
 *
 * Limitations:
 * - Price impact is estimated, not calculated from tick arrays
 * - Does NOT use full tick-by-tick liquidity distribution
 * - May underestimate impact for very large swaps that cross many ticks
 *
 * For highest precision, this should be replaced with full tick array calculation.
 */
export async function quoteSwap(
  _fastify: FastifyInstance,
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress?: string,
  slippagePct: number = PancakeswapSolConfig.config.slippagePct,
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

  // Get pool balances for price impact calculation
  const poolBaseBalance = isBaseTokenFirst ? poolInfo.baseTokenAmount : poolInfo.quoteTokenAmount;
  const poolQuoteBalance = isBaseTokenFirst ? poolInfo.quoteTokenAmount : poolInfo.baseTokenAmount;

  const effectiveSlippage = slippagePct;
  const feePct = poolInfo.feePct;

  let amountIn: number;
  let amountOut: number;
  let minAmountOut: number;
  let maxAmountIn: number;
  let price: number;
  let priceImpactPct: number;

  if (side === 'SELL') {
    // Selling base token for quote token
    amountIn = amount;

    // Estimate price impact based on swap size vs pool liquidity
    // For CLMM, impact is roughly proportional to (amountIn / poolBalance)
    // but amplified since liquidity is concentrated
    const impactRatio = amountIn / poolBaseBalance;
    priceImpactPct = impactRatio * 100; // Simplified: 1% of pool = ~1% impact

    // Calculate execution price with impact (price moves against trader)
    const executionPrice = currentPrice * (1 - priceImpactPct / 100);

    // Calculate output before fees
    const outputBeforeFee = amountIn * executionPrice;

    // Deduct protocol fee from output
    amountOut = outputBeforeFee * (1 - feePct / 100);

    minAmountOut = amountOut * (1 - effectiveSlippage / 100);
    maxAmountIn = amountIn;
    price = amountOut / amountIn; // Effective price after fees and impact
  } else {
    // Buying base token with quote token
    amountOut = amount;

    // Estimate price impact for buy (impact on quote side)
    const estimatedQuoteIn = amount * currentPrice;
    const impactRatio = estimatedQuoteIn / poolQuoteBalance;
    priceImpactPct = impactRatio * 100;

    // Calculate execution price with impact (price moves against trader)
    const executionPrice = currentPrice * (1 + priceImpactPct / 100);

    // Account for fee: need more input to cover fee
    amountIn = (amount * executionPrice) / (1 - feePct / 100);

    minAmountOut = amountOut;
    maxAmountIn = amountIn * (1 + effectiveSlippage / 100);
    price = amountIn / amountOut; // Effective price after fees and impact
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
    priceImpactPct,
  };

  logger.info(
    `PancakeSwap CLMM quote: ${side} ${amount} ${baseTokenSymbol}/${quoteTokenSymbol} - Price: ${price.toFixed(6)}, Impact: ${priceImpactPct.toFixed(4)}%, Fee: ${feePct}%`,
  );

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
          'Get swap quote for PancakeSwap Solana CLMM with fee and estimated price impact based on pool liquidity',
        tags: ['/connector/pancakeswap-sol'],
        querystring: PancakeswapSolClmmQuoteSwapRequest,
        response: { 200: QuoteSwapResponse },
      },
    },
    async (request) => {
      try {
        const {
          network = 'mainnet-beta',
          baseToken,
          quoteToken,
          amount,
          side,
          poolAddress,
          slippagePct,
        } = request.query;

        return await quoteSwap(
          fastify,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddress,
          slippagePct,
        );
      } catch (e: any) {
        logger.error('Quote swap error:', e);
        // Re-throw httpErrors as-is
        if (e.statusCode) {
          throw e;
        }
        // Handle unknown errors
        const errorMessage = e.message || 'Failed to get swap quote';
        throw fastify.httpErrors.internalServerError(errorMessage);
      }
    },
  );
};

export default quoteSwapRoute;

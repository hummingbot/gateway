import Decimal from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { estimateGasSolana } from '../../../chains/solana/routes/estimate-gas';
import { Solana } from '../../../chains/solana/solana';
import { QuoteSwapResponseType, QuoteSwapResponse, QuoteSwapRequestType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Pumpswap } from '../pumpswap';
import { PumpswapConfig } from '../pumpswap.config';
import { PumpswapAmmQuoteSwapRequest } from '../schemas';

/**
 * Calculate swap output using constant product formula (x * y = k)
 * Accounts for fees: fee is deducted from input before calculation
 */
function calculateSwapOutput(amountIn: number, reserveIn: number, reserveOut: number, feePct: number): number {
  // Fee is deducted from input
  const feeMultiplier = 1 - feePct / 100;
  const amountInAfterFee = amountIn * feeMultiplier;

  // Constant product formula: (x + dx) * (y - dy) = x * y
  // Solving for dy: dy = (y * dx) / (x + dx)
  const amountOut = (reserveOut * amountInAfterFee) / (reserveIn + amountInAfterFee);

  return amountOut;
}

/**
 * Calculate swap input needed for desired output
 */
function calculateSwapInput(amountOut: number, reserveIn: number, reserveOut: number, feePct: number): number {
  // Reverse calculation: amountIn = (reserveIn * amountOut) / (reserveOut - amountOut) / feeMultiplier
  const feeMultiplier = 1 - feePct / 100;
  const amountInBeforeFee = (reserveIn * amountOut) / (reserveOut - amountOut);
  const amountIn = amountInBeforeFee / feeMultiplier;

  return amountIn;
}

async function formatSwapQuote(
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = PumpswapConfig.config.slippagePct,
): Promise<QuoteSwapResponseType> {
  logger.info(
    `formatSwapQuote: poolAddress=${poolAddress}, baseToken=${baseToken}, quoteToken=${quoteToken}, amount=${amount}, side=${side}`,
  );

  const pumpswap = await Pumpswap.getInstance(network);
  const solana = await Solana.getInstance(network);

  // Resolve tokens from symbols or addresses
  const resolvedBaseToken = await solana.getToken(baseToken);
  const resolvedQuoteToken = await solana.getToken(quoteToken);

  if (!resolvedBaseToken || !resolvedQuoteToken) {
    throw httpErrors.notFound(`Token not found: ${!resolvedBaseToken ? baseToken : quoteToken}`);
  }

  // Get pool info
  const poolInfo = await pumpswap.getAmmPoolInfo(poolAddress);
  if (!poolInfo) {
    throw httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
  }

  // Verify tokens match pool
  const baseMatches = poolInfo.baseTokenAddress === resolvedBaseToken.address;
  const quoteMatches = poolInfo.quoteTokenAddress === resolvedQuoteToken.address;

  if (!baseMatches && !quoteMatches) {
    throw httpErrors.badRequest('Tokens do not match pool');
  }

  // Determine which token is input and which is output
  let amountIn: number;
  let amountOut: number;
  let tokenIn: string;
  let tokenOut: string;
  let reserveIn: number;
  let reserveOut: number;

  if (side === 'SELL') {
    // Selling base token, buying quote token
    tokenIn = resolvedBaseToken.address;
    tokenOut = resolvedQuoteToken.address;
    reserveIn = poolInfo.baseTokenAmount;
    reserveOut = poolInfo.quoteTokenAmount;
    amountIn = amount;
    amountOut = calculateSwapOutput(amountIn, reserveIn, reserveOut, poolInfo.feePct);
  } else {
    // BUY: Buying base token, selling quote token
    tokenIn = resolvedQuoteToken.address;
    tokenOut = resolvedBaseToken.address;
    reserveIn = poolInfo.quoteTokenAmount;
    reserveOut = poolInfo.baseTokenAmount;
    // For BUY, amount is the desired output (base tokens)
    amountOut = amount;
    amountIn = calculateSwapInput(amountOut, reserveIn, reserveOut, poolInfo.feePct);
  }

  // Apply slippage
  const slippageMultiplier = 1 - slippagePct / 100;
  const minAmountOut = amountOut * slippageMultiplier;
  const maxAmountIn = amountIn / slippageMultiplier;

  // Calculate price
  const price = side === 'SELL' ? amountOut / amountIn : amountIn / amountOut;

  // Calculate price impact (simplified)
  const priceImpactPct = 0; // Could calculate based on reserves

  return {
    poolAddress,
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    price,
    slippagePct,
    minAmountOut,
    maxAmountIn,
    priceImpactPct,
  };
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: QuoteSwapResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for Pumpswap AMM',
        tags: ['/connector/pumpswap'],
        querystring: PumpswapAmmQuoteSwapRequest,
        response: {
          200: QuoteSwapResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, poolAddress, baseToken, quoteToken, amount, side, slippagePct } = request.query;
        const networkToUse = network;

        // Validate essential parameters
        if (!baseToken || !quoteToken || !amount || !side) {
          throw httpErrors.badRequest('baseToken, quoteToken, amount, and side are required');
        }

        const pumpswap = await Pumpswap.getInstance(networkToUse);
        const solana = await Solana.getInstance(networkToUse);

        let poolAddressToUse = poolAddress;

        // If poolAddress is not provided, look it up by token pair
        if (!poolAddressToUse) {
          // Resolve token symbols to get proper symbols for pool lookup
          const baseTokenInfo = await solana.getToken(baseToken);
          const quoteTokenInfo = await solana.getToken(quoteToken);

          if (!baseTokenInfo || !quoteTokenInfo) {
            throw httpErrors.badRequest(
              sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken),
            );
          }

          // Use PoolService to find pool by token pair
          const { PoolService } = await import('../../../services/pool-service');
          const poolService = PoolService.getInstance();

          const pool = await poolService.getPool(
            'pumpswap',
            networkToUse,
            'amm',
            baseTokenInfo.symbol,
            quoteTokenInfo.symbol,
          );

          if (!pool) {
            throw httpErrors.notFound(
              `No AMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Pumpswap`,
            );
          }

          poolAddressToUse = pool.address;
        }

        const result = await formatSwapQuote(
          networkToUse,
          poolAddressToUse,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
        );

        let gasEstimation = null;
        try {
          gasEstimation = await estimateGasSolana(networkToUse);
        } catch (error) {
          logger.warn(`Failed to estimate gas for swap quote: ${error.message}`);
        }

        return result;
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        if (e.message?.includes('Pool not found')) {
          throw httpErrors.notFound(e.message);
        }
        if (e.message?.includes('Token not found')) {
          throw httpErrors.badRequest(e.message);
        }
        throw httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default quoteSwapRoute;

// Export quoteSwap wrapper for chain-level routes
export async function quoteSwap(
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = PumpswapConfig.config.slippagePct,
): Promise<QuoteSwapResponseType> {
  return await formatSwapQuote(network, poolAddress, baseToken, quoteToken, amount, side, slippagePct);
}

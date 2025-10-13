import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { QuoteSwapResponseType, QuoteSwapResponse } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { OrcaClmmQuoteSwapRequest, OrcaClmmQuoteSwapRequestType } from '../schemas';

/**
 * Calculate swap output amount using constant product formula with fees
 * This is a simplified calculation - for production use, you'd want to use
 * the full Orca SDK swap math which accounts for concentrated liquidity ranges
 */
function calculateSwapOutput(amountIn: number, reserveIn: number, reserveOut: number, feePct: number): number {
  // Apply fee to input amount
  const amountInWithFee = amountIn * (1 - feePct / 100);

  // Constant product formula: (x + Δx)(y - Δy) = xy
  // Solving for Δy: Δy = y * Δx / (x + Δx)
  const amountOut = (reserveOut * amountInWithFee) / (reserveIn + amountInWithFee);

  return amountOut;
}

/**
 * Calculate swap input amount needed for a desired output (for BUY orders)
 */
function calculateSwapInput(amountOut: number, reserveIn: number, reserveOut: number, feePct: number): number {
  // Reverse constant product formula
  // x * y = k, where we want to get Δy output
  // Δx = (x * Δy) / (y - Δy) / (1 - fee)
  const amountInBeforeFee = (reserveIn * amountOut) / (reserveOut - amountOut);
  const amountIn = amountInBeforeFee / (1 - feePct / 100);

  return amountIn;
}

export async function getRawSwapQuote(
  fastify: FastifyInstance,
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct: number = 1,
) {
  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);

  // Get pool info
  const poolInfo = await orca.getPoolInfo(poolAddress);
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  // Get token info to determine decimals
  const baseTokenInfo = await solana.getToken(baseTokenSymbol);
  const quoteTokenInfo = await solana.getToken(quoteTokenSymbol);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.badRequest(`Token not found: ${!baseTokenInfo ? baseTokenSymbol : quoteTokenSymbol}`);
  }

  // Determine which token is A and which is B in the pool
  const isBaseTokenA = poolInfo.baseTokenAddress.toLowerCase() === baseTokenInfo.address.toLowerCase();

  let inputAmount: number;
  let outputAmount: number;
  let inputMint: string;
  let outputMint: string;

  if (side === 'SELL') {
    // SELL: selling base token for quote token
    inputMint = baseTokenInfo.address;
    outputMint = quoteTokenInfo.address;
    inputAmount = amount;

    if (isBaseTokenA) {
      // Base is token A, quote is token B
      outputAmount = calculateSwapOutput(amount, poolInfo.baseTokenAmount, poolInfo.quoteTokenAmount, poolInfo.feePct);
    } else {
      // Base is token B, quote is token A
      outputAmount = calculateSwapOutput(amount, poolInfo.quoteTokenAmount, poolInfo.baseTokenAmount, poolInfo.feePct);
    }
  } else {
    // BUY: buying base token with quote token
    inputMint = quoteTokenInfo.address;
    outputMint = baseTokenInfo.address;
    outputAmount = amount;

    if (isBaseTokenA) {
      // Base is token A, quote is token B - we're buying A with B
      inputAmount = calculateSwapInput(amount, poolInfo.quoteTokenAmount, poolInfo.baseTokenAmount, poolInfo.feePct);
    } else {
      // Base is token B, quote is token A - we're buying B with A
      inputAmount = calculateSwapInput(amount, poolInfo.baseTokenAmount, poolInfo.quoteTokenAmount, poolInfo.feePct);
    }
  }

  // Apply slippage
  const minOutputAmount = outputAmount * (1 - slippagePct / 100);
  const maxInputAmount = inputAmount * (1 + slippagePct / 100);

  return {
    inputMint,
    outputMint,
    inputAmount,
    outputAmount,
    minOutputAmount,
    maxInputAmount,
    priceImpact: 0, // TODO: Calculate actual price impact
    feePct: poolInfo.feePct,
  };
}

async function formatSwapQuote(
  fastify: FastifyInstance,
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct: number = 1,
): Promise<QuoteSwapResponseType> {
  const quote = await getRawSwapQuote(
    fastify,
    network,
    baseTokenSymbol,
    quoteTokenSymbol,
    amount,
    side,
    poolAddress,
    slippagePct,
  );

  const solana = await Solana.getInstance(network);
  const baseTokenInfo = await solana.getToken(baseTokenSymbol);
  const quoteTokenInfo = await solana.getToken(quoteTokenSymbol);

  return {
    poolAddress,
    tokenIn: quote.inputMint,
    tokenOut: quote.outputMint,
    amountIn: quote.inputAmount,
    amountOut: quote.outputAmount,
    price: quote.outputAmount / quote.inputAmount,
    slippagePct,
    minAmountOut: quote.minOutputAmount,
    maxAmountIn: quote.maxInputAmount,
    priceImpactPct: quote.priceImpact,
  };
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: OrcaClmmQuoteSwapRequestType;
    Reply: QuoteSwapResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for Orca CLMM',
        tags: ['/connector/orca'],
        querystring: OrcaClmmQuoteSwapRequest,
        response: {
          200: QuoteSwapResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.query;
        const networkUsed = network;

        // Validate essential parameters
        if (!baseToken || !quoteToken || !amount || !side) {
          throw fastify.httpErrors.badRequest('baseToken, quoteToken, amount, and side are required');
        }

        const solana = await Solana.getInstance(networkUsed);
        const orca = await Orca.getInstance(networkUsed);

        let poolAddressToUse = poolAddress;

        // If poolAddress is not provided, look it up by token pair
        if (!poolAddressToUse) {
          const baseTokenInfo = await solana.getToken(baseToken);
          const quoteTokenInfo = await solana.getToken(quoteToken);

          if (!baseTokenInfo || !quoteTokenInfo) {
            throw fastify.httpErrors.badRequest(`Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
          }

          // Use PoolService to find pool by token pair
          const { PoolService } = await import('../../../services/pool-service');
          const poolService = PoolService.getInstance();

          const pool = await poolService.getPool(
            'orca',
            networkUsed,
            'clmm',
            baseTokenInfo.symbol,
            quoteTokenInfo.symbol,
          );

          if (!pool) {
            throw fastify.httpErrors.notFound(
              `No CLMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Orca`,
            );
          }

          poolAddressToUse = pool.address;
        }

        return await formatSwapQuote(
          fastify,
          networkUsed,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddressToUse,
          slippagePct,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default quoteSwapRoute;

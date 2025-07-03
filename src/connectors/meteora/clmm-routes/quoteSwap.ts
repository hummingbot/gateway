import { SwapQuoteExactOut, SwapQuote } from '@meteora-ag/dlmm';
import { DecimalUtil } from '@orca-so/common-sdk';
import { BN } from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { estimateGasSolana } from '../../../chains/solana/routes/estimate-gas';
import { Solana } from '../../../chains/solana/solana';
import {
  QuoteSwapResponseType,
  QuoteSwapResponse,
  QuoteSwapRequestType,
  QuoteSwapRequest,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Meteora } from '../meteora';

export async function getRawSwapQuote(
  fastify: FastifyInstance,
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct?: number,
) {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const baseToken = await solana.getToken(baseTokenSymbol);
  const quoteToken = await solana.getToken(quoteTokenSymbol);

  if (!baseToken || !quoteToken) {
    throw fastify.httpErrors.notFound(
      `Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`,
    );
  }

  const dlmmPool = await meteora.getDlmmPool(poolAddress);
  if (!dlmmPool) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  // For buy orders, we're swapping quote token for base token (ExactOut)
  // For sell orders, we're swapping base token for quote token (ExactIn)
  const [inputToken, outputToken] =
    side === 'BUY' ? [quoteToken, baseToken] : [baseToken, quoteToken];

  const amount_bn =
    side === 'BUY'
      ? DecimalUtil.toBN(new Decimal(amount), outputToken.decimals)
      : DecimalUtil.toBN(new Decimal(amount), inputToken.decimals);
  const swapForY = inputToken.address === dlmmPool.tokenX.publicKey.toBase58();
  const binArrays = await dlmmPool.getBinArrayForSwap(swapForY);
  const effectiveSlippage = new BN(
    (slippagePct ?? meteora.getSlippagePct()) * 100,
  );

  const quote =
    side === 'BUY'
      ? dlmmPool.swapQuoteExactOut(
          amount_bn,
          swapForY,
          effectiveSlippage,
          binArrays,
        )
      : dlmmPool.swapQuote(amount_bn, swapForY, effectiveSlippage, binArrays);

  return {
    inputToken,
    outputToken,
    swapAmount: amount_bn,
    swapForY,
    quote,
    dlmmPool,
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
  slippagePct?: number,
): Promise<QuoteSwapResponseType> {
  const { inputToken, outputToken, quote, dlmmPool } = await getRawSwapQuote(
    fastify,
    network,
    baseTokenSymbol,
    quoteTokenSymbol,
    amount,
    side as 'BUY' | 'SELL',
    poolAddress,
    slippagePct,
  );

  // Get tokens in pool order (X, Y) for consistent balance change calculation
  const solana = await Solana.getInstance(network);
  const tokenX = await solana.getToken(dlmmPool.tokenX.publicKey.toBase58());
  const tokenY = await solana.getToken(dlmmPool.tokenY.publicKey.toBase58());

  if (!tokenX || !tokenY) {
    throw new Error('Failed to get pool tokens');
  }

  if (side === 'BUY') {
    const exactOutQuote = quote as SwapQuoteExactOut;
    const estimatedAmountIn = DecimalUtil.fromBN(
      exactOutQuote.inAmount,
      inputToken.decimals,
    ).toNumber();
    const maxAmountIn = DecimalUtil.fromBN(
      exactOutQuote.maxInAmount,
      inputToken.decimals,
    ).toNumber();
    const amountOut = DecimalUtil.fromBN(
      exactOutQuote.outAmount,
      outputToken.decimals,
    ).toNumber();

    const price = amountOut / estimatedAmountIn;

    return {
      poolAddress,
      estimatedAmountIn,
      estimatedAmountOut: amountOut,
      maxAmountIn,
      minAmountOut: amountOut,
      price,
      priceImpactPct: 0, // TODO: Calculate actual price impact
      fee: 0.3, // Default fee percentage
      computeUnits: 0,
      activeBinId: 0, // TODO: Get active bin ID
      tokenIn: inputToken.address,
      tokenOut: outputToken.address,
      tokenInAmount: estimatedAmountIn,
      tokenOutAmount: amountOut,
    };
  } else {
    const exactInQuote = quote as SwapQuote;
    const estimatedAmountIn = DecimalUtil.fromBN(
      exactInQuote.consumedInAmount,
      inputToken.decimals,
    ).toNumber();
    const estimatedAmountOut = DecimalUtil.fromBN(
      exactInQuote.outAmount,
      outputToken.decimals,
    ).toNumber();
    const minAmountOut = DecimalUtil.fromBN(
      exactInQuote.minOutAmount,
      outputToken.decimals,
    ).toNumber();

    // For sell orders:
    // - Base token (input) decreases (negative)
    // - Quote token (output) increases (positive)
    const baseTokenChange = -estimatedAmountIn;
    const quoteTokenChange = estimatedAmountOut;

    const price = estimatedAmountOut / estimatedAmountIn;

    return {
      poolAddress,
      estimatedAmountIn,
      estimatedAmountOut,
      minAmountOut,
      maxAmountIn: estimatedAmountIn,
      price,
      priceImpactPct: 0, // TODO: Calculate actual price impact
      fee: 0.3, // Default fee percentage
      computeUnits: 0,
      activeBinId: 0, // TODO: Get active bin ID
      tokenIn: inputToken.address,
      tokenOut: outputToken.address,
      tokenInAmount: estimatedAmountIn,
      tokenOutAmount: estimatedAmountOut,
    };
  }
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: QuoteSwapResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for Meteora CLMM',
        tags: ['/connector/meteora'],
        querystring: QuoteSwapRequest,
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
          baseToken,
          quoteToken,
          amount,
          side,
          poolAddress,
          slippagePct,
        } = request.query;
        const networkUsed = network;

        // Validate essential parameters
        if (!baseToken || !quoteToken || !amount || !side) {
          throw fastify.httpErrors.badRequest(
            'baseToken, quoteToken, amount, and side are required',
          );
        }

        const solana = await Solana.getInstance(networkUsed);

        let poolAddressToUse = poolAddress;

        // If poolAddress is not provided, look it up by token pair
        if (!poolAddressToUse) {
          // Resolve token symbols to get proper symbols for pool lookup
          const baseTokenInfo = await solana.getToken(baseToken);
          const quoteTokenInfo = await solana.getToken(quoteToken);

          if (!baseTokenInfo || !quoteTokenInfo) {
            throw fastify.httpErrors.badRequest(
              sanitizeErrorMessage(
                'Token not found: {}',
                !baseTokenInfo ? baseToken : quoteToken,
              ),
            );
          }

          // Use PoolService to find pool by token pair
          const { PoolService } = await import(
            '../../../services/pool-service'
          );
          const poolService = PoolService.getInstance();

          const pool = await poolService.getPool(
            'meteora',
            networkUsed,
            'clmm',
            baseTokenInfo.symbol,
            quoteTokenInfo.symbol,
          );

          if (!pool) {
            throw fastify.httpErrors.notFound(
              `No CLMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Meteora`,
            );
          }

          poolAddressToUse = pool.address;
        }

        const result = await formatSwapQuote(
          fastify,
          networkUsed,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddressToUse,
          slippagePct,
        );

        const computeUnits = 150000; // Default compute units for Meteora swaps
        try {
          // Note: estimateGasSolana returns feePerComputeUnit, not gasLimit
          // For Solana, we use a default compute units value for swaps
          await estimateGasSolana(fastify, networkUsed);
          // Keep the default compute units value
        } catch (error) {
          logger.warn(
            `Failed to estimate gas for swap quote: ${error.message}`,
          );
        }

        return {
          ...result,
          computeUnits,
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default quoteSwapRoute;

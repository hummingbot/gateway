import { DecimalUtil } from '@orca-so/common-sdk';
import {
  PoolUtils,
  ReturnTypeComputeAmountOutFormat,
  ReturnTypeComputeAmountOutBaseOut,
} from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { estimateGasSolana } from '../../../chains/solana/routes/estimate-gas';
import { Solana } from '../../../chains/solana/solana';
import {
  QuoteSwapResponseType,
  QuoteSwapResponse,
  QuoteSwapRequestType,
  QuoteSwapRequest,
} from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Raydium } from '../raydium';
import { RaydiumConfig } from '../raydium.config';
import { RaydiumClmmQuoteSwapRequest } from '../schemas';

/**
 * Helper function to convert amount for buy orders in Raydium CLMM
 * This handles the special case where we need to invert the amount due to SDK limitations
 * @param order_amount The order amount
 * @param inputTokenDecimals The decimals of the input token
 * @param outputTokenDecimals The decimals of the output token
 * @param amountToConvert The BN raw amount to convert (e.g. amountIn or maxAmountIn) from the SDK
 * @returns The converted amount
 */
export function convertAmountIn(
  order_amount: number,
  inputTokenDecimals: number,
  outputTokenDecimals: number,
  amountIn: BN,
): number {
  const inputDecimals =
    Math.log10(order_amount) * 2 +
    Math.max(inputTokenDecimals, outputTokenDecimals) +
    Math.abs(inputTokenDecimals - outputTokenDecimals);
  return 1 / (amountIn.toNumber() / 10 ** inputDecimals);
}

export async function getSwapQuote(
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct: number = RaydiumConfig.config.slippagePct,
) {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);
  const baseToken = await solana.getToken(baseTokenSymbol);
  const quoteToken = await solana.getToken(quoteTokenSymbol);

  if (!baseToken || !quoteToken) {
    throw httpErrors.notFound(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
  }

  const [poolInfo] = await raydium.getClmmPoolfromAPI(poolAddress);
  if (!poolInfo) {
    throw httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
  }

  // For buy orders, we're swapping quote token for base token (ExactOut)
  // For sell orders, we're swapping base token for quote token (ExactIn)
  const [inputToken, outputToken] = side === 'BUY' ? [quoteToken, baseToken] : [baseToken, quoteToken];

  const amount_bn =
    side === 'BUY'
      ? DecimalUtil.toBN(new Decimal(amount), outputToken.decimals)
      : DecimalUtil.toBN(new Decimal(amount), inputToken.decimals);
  const clmmPoolInfo = await PoolUtils.fetchComputeClmmInfo({
    connection: solana.connection,
    poolInfo,
  });
  const tickCache = await PoolUtils.fetchMultiplePoolTickArrays({
    connection: solana.connection,
    poolKeys: [clmmPoolInfo],
  });
  const effectiveSlippage = new BN(slippagePct / 100);

  // Convert BN to number for slippage
  const effectiveSlippageNumber = effectiveSlippage.toNumber();

  // AmountOut = swapQuote, AmountOutBaseOut = swapQuoteExactOut
  const response: ReturnTypeComputeAmountOutFormat | ReturnTypeComputeAmountOutBaseOut =
    side === 'BUY'
      ? await PoolUtils.computeAmountIn({
          poolInfo: clmmPoolInfo,
          tickArrayCache: tickCache[poolAddress],
          amountOut: amount_bn,
          epochInfo: await raydium.raydiumSDK.fetchEpochInfo(),
          baseMint: new PublicKey(poolInfo['mintB'].address),
          slippage: effectiveSlippageNumber,
        })
      : await PoolUtils.computeAmountOutFormat({
          poolInfo: clmmPoolInfo,
          tickArrayCache: tickCache[poolAddress],
          amountIn: amount_bn,
          tokenOut: poolInfo['mintB'],
          slippage: effectiveSlippageNumber,
          epochInfo: await raydium.raydiumSDK.fetchEpochInfo(),
          catchLiquidityInsufficient: true,
        });

  return {
    inputToken,
    outputToken,
    response,
    clmmPoolInfo,
    tickArrayCache: tickCache[poolAddress],
  };
}

async function formatSwapQuote(
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<QuoteSwapResponseType> {
  const { inputToken, outputToken, response } = await getSwapQuote(
    network,
    baseTokenSymbol,
    quoteTokenSymbol,
    amount,
    side,
    poolAddress,
    slippagePct,
  );
  logger.debug(
    `Raydium CLMM swap quote: ${side} ${amount} ${baseTokenSymbol}/${quoteTokenSymbol} in pool ${poolAddress}`,
    {
      inputToken: inputToken.symbol,
      outputToken: outputToken.symbol,
      responseType: side === 'BUY' ? 'ReturnTypeComputeAmountOutBaseOut' : 'ReturnTypeComputeAmountOutFormat',
      response:
        side === 'BUY'
          ? {
              amountIn: {
                amount: (response as ReturnTypeComputeAmountOutBaseOut).amountIn.amount.toNumber(),
              },
              maxAmountIn: {
                amount: (response as ReturnTypeComputeAmountOutBaseOut).maxAmountIn.amount.toNumber(),
              },
              realAmountOut: {
                amount: (response as ReturnTypeComputeAmountOutBaseOut).realAmountOut.amount.toNumber(),
              },
            }
          : {
              realAmountIn: {
                amount: {
                  raw: (response as ReturnTypeComputeAmountOutFormat).realAmountIn.amount.raw.toNumber(),
                  token: {
                    symbol: (response as ReturnTypeComputeAmountOutFormat).realAmountIn.amount.token.symbol,
                    mint: (response as ReturnTypeComputeAmountOutFormat).realAmountIn.amount.token.mint,
                    decimals: (response as ReturnTypeComputeAmountOutFormat).realAmountIn.amount.token.decimals,
                  },
                },
              },
              amountOut: {
                amount: {
                  raw: (response as ReturnTypeComputeAmountOutFormat).amountOut.amount.raw.toNumber(),
                  token: {
                    symbol: (response as ReturnTypeComputeAmountOutFormat).amountOut.amount.token.symbol,
                    mint: (response as ReturnTypeComputeAmountOutFormat).amountOut.amount.token.mint,
                    decimals: (response as ReturnTypeComputeAmountOutFormat).amountOut.amount.token.decimals,
                  },
                },
              },
              minAmountOut: {
                amount: {
                  numerator: (response as ReturnTypeComputeAmountOutFormat).minAmountOut.amount.raw.toNumber(),
                  token: {
                    symbol: (response as ReturnTypeComputeAmountOutFormat).minAmountOut.amount.token.symbol,
                    mint: (response as ReturnTypeComputeAmountOutFormat).minAmountOut.amount.token.mint,
                    decimals: (response as ReturnTypeComputeAmountOutFormat).minAmountOut.amount.token.decimals,
                  },
                },
              },
            },
    },
  );

  if (side === 'BUY') {
    const exactOutResponse = response as ReturnTypeComputeAmountOutBaseOut;
    const estimatedAmountOut = exactOutResponse.realAmountOut.amount.toNumber() / 10 ** outputToken.decimals;
    const estimatedAmountIn = convertAmountIn(
      amount,
      inputToken.decimals,
      outputToken.decimals,
      exactOutResponse.amountIn.amount,
    );
    const maxAmountIn = convertAmountIn(
      amount,
      inputToken.decimals,
      outputToken.decimals,
      exactOutResponse.maxAmountIn.amount,
    );

    const price = estimatedAmountOut > 0 ? estimatedAmountIn / estimatedAmountOut : 0;

    // Calculate price impact percentage - ensure it's a valid number
    const priceImpactRaw = exactOutResponse.priceImpact ? Number(exactOutResponse.priceImpact) * 100 : 0;
    const priceImpactPct = isNaN(priceImpactRaw) || !isFinite(priceImpactRaw) ? 0 : priceImpactRaw;

    // Determine token addresses for computed fields
    const tokenIn = inputToken.address;
    const tokenOut = outputToken.address;

    // Validate all numeric values before returning
    const result = {
      // Base QuoteSwapResponse fields in correct order
      poolAddress,
      tokenIn,
      tokenOut,
      amountIn: isNaN(estimatedAmountIn) || !isFinite(estimatedAmountIn) ? 0 : estimatedAmountIn,
      amountOut: isNaN(estimatedAmountOut) || !isFinite(estimatedAmountOut) ? 0 : estimatedAmountOut,
      price: isNaN(price) || !isFinite(price) ? 0 : price,
      slippagePct: slippagePct,
      minAmountOut: isNaN(estimatedAmountOut) || !isFinite(estimatedAmountOut) ? 0 : estimatedAmountOut,
      maxAmountIn: isNaN(maxAmountIn) || !isFinite(maxAmountIn) ? 0 : maxAmountIn,
      // CLMM-specific fields
      priceImpactPct: isNaN(priceImpactPct) || !isFinite(priceImpactPct) ? 0 : priceImpactPct,
    };

    logger.debug(`Returning CLMM quote result (BUY):`, result);
    return result;
  } else {
    const exactInResponse = response as ReturnTypeComputeAmountOutFormat;
    const estimatedAmountIn = exactInResponse.realAmountIn.amount.raw.toNumber() / 10 ** inputToken.decimals;
    const estimatedAmountOut = exactInResponse.amountOut.amount.raw.toNumber() / 10 ** outputToken.decimals;

    // Calculate minAmountOut using slippage
    const effectiveSlippage = slippagePct;
    const minAmountOut = estimatedAmountOut * (1 - effectiveSlippage / 100);

    const price = estimatedAmountIn > 0 ? estimatedAmountOut / estimatedAmountIn : 0;

    // Calculate price impact percentage - ensure it's a valid number
    const priceImpactRaw = exactInResponse.priceImpact ? Number(exactInResponse.priceImpact) * 100 : 0;
    const priceImpactPct = isNaN(priceImpactRaw) || !isFinite(priceImpactRaw) ? 0 : priceImpactRaw;

    // Determine token addresses for computed fields
    const tokenIn = inputToken.address;
    const tokenOut = outputToken.address;

    // Validate all numeric values before returning
    const result = {
      // Base QuoteSwapResponse fields in correct order
      poolAddress,
      tokenIn,
      tokenOut,
      amountIn: isNaN(estimatedAmountIn) || !isFinite(estimatedAmountIn) ? 0 : estimatedAmountIn,
      amountOut: isNaN(estimatedAmountOut) || !isFinite(estimatedAmountOut) ? 0 : estimatedAmountOut,
      price: isNaN(price) || !isFinite(price) ? 0 : price,
      slippagePct: slippagePct,
      minAmountOut: isNaN(minAmountOut) || !isFinite(minAmountOut) ? 0 : minAmountOut,
      maxAmountIn: isNaN(estimatedAmountIn) || !isFinite(estimatedAmountIn) ? 0 : estimatedAmountIn,
      // CLMM-specific fields
      priceImpactPct: isNaN(priceImpactPct) || !isFinite(priceImpactPct) ? 0 : priceImpactPct,
    };

    logger.info(`Returning CLMM quote result:`, result);
    return result;
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
        description: 'Get swap quote for Raydium CLMM',
        tags: ['/connector/raydium'],
        querystring: RaydiumClmmQuoteSwapRequest,
        response: { 200: QuoteSwapResponse },
      },
    },
    async (request) => {
      try {
        const { network, baseToken, quoteToken, amount, side, poolAddress, slippagePct } =
          request.query as typeof RaydiumClmmQuoteSwapRequest._type;
        const networkToUse = network;

        // Validate essential parameters
        if (!baseToken || !quoteToken || !amount || !side) {
          throw httpErrors.badRequest('baseToken, quoteToken, amount, and side are required');
        }

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
            'raydium',
            networkToUse,
            'clmm',
            baseTokenInfo.symbol,
            quoteTokenInfo.symbol,
          );

          if (!pool) {
            throw httpErrors.notFound(
              `No CLMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Raydium`,
            );
          }

          poolAddressToUse = pool.address;
        }

        const result = await formatSwapQuote(
          networkToUse,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddressToUse,
          slippagePct,
        );

        let gasEstimation = null;
        try {
          gasEstimation = await estimateGasSolana(networkToUse);
        } catch (error) {
          logger.warn(`Failed to estimate gas for swap quote: ${error.message}`);
        }

        return {
          poolAddress: poolAddressToUse,
          ...result,
        };
      } catch (e) {
        logger.error(e);
        // Preserve the original error if it's a FastifyError
        if (e.statusCode) {
          throw e;
        }
        throw httpErrors.internalServerError('Failed to get swap quote');
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
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<QuoteSwapResponseType> {
  return await formatSwapQuote(network, baseToken, quoteToken, amount, side, poolAddress, slippagePct);
}

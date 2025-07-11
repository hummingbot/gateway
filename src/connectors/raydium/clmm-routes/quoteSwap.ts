import { DecimalUtil } from '@orca-so/common-sdk';
import {
  PoolUtils,
  ReturnTypeComputeAmountOutFormat,
  ReturnTypeComputeAmountOutBaseOut,
} from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
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
  const raydium = await Raydium.getInstance(network);
  const baseToken = await solana.getToken(baseTokenSymbol);
  const quoteToken = await solana.getToken(quoteTokenSymbol);

  if (!baseToken || !quoteToken) {
    throw fastify.httpErrors.notFound(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
  }

  const [poolInfo] = await raydium.getClmmPoolfromAPI(poolAddress);
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
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
  const effectiveSlippage = new BN((slippagePct ?? RaydiumConfig.config.slippagePct) / 100);

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
  fastify: FastifyInstance,
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct?: number,
): Promise<QuoteSwapResponseType> {
  const { inputToken, outputToken, response } = await getSwapQuote(
    fastify,
    network,
    baseTokenSymbol,
    quoteTokenSymbol,
    amount,
    side,
    poolAddress,
    slippagePct,
  );
  logger.info(
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

    const price = estimatedAmountIn / estimatedAmountOut;

    // Calculate price impact percentage
    const priceImpactPct = exactOutResponse.priceImpact ? Number(exactOutResponse.priceImpact) * 100 : 0;

    // Get current price/tick
    const activeBinId = exactOutResponse.currentPrice ? Number(exactOutResponse.currentPrice) : 0;

    // Determine token addresses for computed fields
    const tokenIn = inputToken.address;
    const tokenOut = outputToken.address;

    // Calculate fee
    const fee = exactOutResponse.fee ? exactOutResponse.fee.toNumber() / 10 ** outputToken.decimals : 0;

    // Calculate price with slippage (BUY side)
    // For BUY: priceWithSlippage = estimatedAmountOut / maxAmountIn (worst price you'll accept)
    const priceWithSlippage = estimatedAmountOut / maxAmountIn;

    return {
      // Base QuoteSwapResponse fields in correct order
      poolAddress,
      tokenIn,
      tokenOut,
      amountIn: estimatedAmountIn,
      amountOut: estimatedAmountOut,
      price,
      slippagePct: slippagePct || 1, // Default 1% if not provided
      priceWithSlippage,
      minAmountOut: estimatedAmountOut,
      maxAmountIn,
      // CLMM-specific fields
      priceImpactPct,
      fee,
      computeUnits: 600000, // CLMM swaps typically need 600k compute units
      activeBinId,
    };
  } else {
    const exactInResponse = response as ReturnTypeComputeAmountOutFormat;
    const estimatedAmountIn = exactInResponse.realAmountIn.amount.raw.toNumber() / 10 ** inputToken.decimals;
    const estimatedAmountOut = exactInResponse.amountOut.amount.raw.toNumber() / 10 ** outputToken.decimals;
    const minAmountOut = exactInResponse.minAmountOut.amount.raw.toNumber() / 10 ** outputToken.decimals;

    const price = estimatedAmountOut / estimatedAmountIn;

    // Calculate price impact percentage
    const priceImpactPct = exactInResponse.priceImpact ? Number(exactInResponse.priceImpact) * 100 : 0;

    // Get current price/tick
    const activeBinId = exactInResponse.currentPrice ? Number(exactInResponse.currentPrice) : 0;

    // Determine token addresses for computed fields
    const tokenIn = inputToken.address;
    const tokenOut = outputToken.address;

    // Calculate fee
    const fee = exactInResponse.fee ? Number(exactInResponse.fee) / 10 ** outputToken.decimals : 0;

    // Calculate price with slippage (SELL side)
    // For SELL: priceWithSlippage = minAmountOut / estimatedAmountIn (worst price you'll accept)
    const priceWithSlippage = minAmountOut / estimatedAmountIn;

    return {
      // Base QuoteSwapResponse fields in correct order
      poolAddress,
      tokenIn,
      tokenOut,
      amountIn: estimatedAmountIn,
      amountOut: estimatedAmountOut,
      price,
      slippagePct: slippagePct || 1, // Default 1% if not provided
      priceWithSlippage,
      minAmountOut,
      maxAmountIn: estimatedAmountIn,
      // CLMM-specific fields
      priceImpactPct,
      fee,
      computeUnits: 600000, // CLMM swaps typically need 600k compute units
      activeBinId,
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
        description: 'Get swap quote for Raydium CLMM',
        tags: ['/connector/raydium'],
        querystring: {
          ...RaydiumClmmQuoteSwapRequest,
          properties: {
            ...RaydiumClmmQuoteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.01] },
            side: { type: 'string', enum: ['BUY', 'SELL'] },
            poolAddress: { type: 'string', examples: [''] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
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
          throw fastify.httpErrors.badRequest('baseToken, quoteToken, amount, and side are required');
        }

        const solana = await Solana.getInstance(networkToUse);

        let poolAddressToUse = poolAddress;

        // If poolAddress is not provided, look it up by token pair
        if (!poolAddressToUse) {
          // Resolve token symbols to get proper symbols for pool lookup
          const baseTokenInfo = await solana.getToken(baseToken);
          const quoteTokenInfo = await solana.getToken(quoteToken);

          if (!baseTokenInfo || !quoteTokenInfo) {
            throw fastify.httpErrors.badRequest(
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
            throw fastify.httpErrors.notFound(
              `No CLMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Raydium`,
            );
          }

          poolAddressToUse = pool.address;
        }

        const result = await formatSwapQuote(
          fastify,
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
          gasEstimation = await estimateGasSolana(fastify, networkToUse);
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
        throw fastify.httpErrors.internalServerError('Failed to get swap quote');
      }
    },
  );
};

export default quoteSwapRoute;

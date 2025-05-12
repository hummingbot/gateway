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
  GetSwapQuoteResponseType,
  GetSwapQuoteResponse,
  GetSwapQuoteRequestType,
  GetSwapQuoteRequest,
} from '../../../schemas/trading-types/swap-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';

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
    throw fastify.httpErrors.notFound(
      `Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`,
    );
  }

  const [poolInfo] = await raydium.getClmmPoolfromAPI(poolAddress);
  if (!poolInfo) {
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
  const clmmPoolInfo = await PoolUtils.fetchComputeClmmInfo({
    connection: solana.connection,
    poolInfo,
  });
  const tickCache = await PoolUtils.fetchMultiplePoolTickArrays({
    connection: solana.connection,
    poolKeys: [clmmPoolInfo],
  });
  const effectiveSlippage = new BN(
    (slippagePct ?? raydium.getSlippagePct()) / 100,
  );

  // Convert BN to number for slippage
  const effectiveSlippageNumber = effectiveSlippage.toNumber();

  // AmountOut = swapQuote, AmountOutBaseOut = swapQuoteExactOut
  const response:
    | ReturnTypeComputeAmountOutFormat
    | ReturnTypeComputeAmountOutBaseOut =
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
): Promise<GetSwapQuoteResponseType> {
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
      responseType:
        side === 'BUY'
          ? 'ReturnTypeComputeAmountOutBaseOut'
          : 'ReturnTypeComputeAmountOutFormat',
      response:
        side === 'BUY'
          ? {
              amountIn: {
                amount: (
                  response as ReturnTypeComputeAmountOutBaseOut
                ).amountIn.amount.toNumber(),
              },
              maxAmountIn: {
                amount: (
                  response as ReturnTypeComputeAmountOutBaseOut
                ).maxAmountIn.amount.toNumber(),
              },
              realAmountOut: {
                amount: (
                  response as ReturnTypeComputeAmountOutBaseOut
                ).realAmountOut.amount.toNumber(),
              },
            }
          : {
              realAmountIn: {
                amount: {
                  raw: (
                    response as ReturnTypeComputeAmountOutFormat
                  ).realAmountIn.amount.raw.toNumber(),
                  token: {
                    symbol: (response as ReturnTypeComputeAmountOutFormat)
                      .realAmountIn.amount.token.symbol,
                    mint: (response as ReturnTypeComputeAmountOutFormat)
                      .realAmountIn.amount.token.mint,
                    decimals: (response as ReturnTypeComputeAmountOutFormat)
                      .realAmountIn.amount.token.decimals,
                  },
                },
              },
              amountOut: {
                amount: {
                  raw: (
                    response as ReturnTypeComputeAmountOutFormat
                  ).amountOut.amount.raw.toNumber(),
                  token: {
                    symbol: (response as ReturnTypeComputeAmountOutFormat)
                      .amountOut.amount.token.symbol,
                    mint: (response as ReturnTypeComputeAmountOutFormat)
                      .amountOut.amount.token.mint,
                    decimals: (response as ReturnTypeComputeAmountOutFormat)
                      .amountOut.amount.token.decimals,
                  },
                },
              },
              minAmountOut: {
                amount: {
                  numerator: (
                    response as ReturnTypeComputeAmountOutFormat
                  ).minAmountOut.amount.raw.toNumber(),
                  token: {
                    symbol: (response as ReturnTypeComputeAmountOutFormat)
                      .minAmountOut.amount.token.symbol,
                    mint: (response as ReturnTypeComputeAmountOutFormat)
                      .minAmountOut.amount.token.mint,
                    decimals: (response as ReturnTypeComputeAmountOutFormat)
                      .minAmountOut.amount.token.decimals,
                  },
                },
              },
            },
    },
  );

  if (side === 'BUY') {
    const exactOutResponse = response as ReturnTypeComputeAmountOutBaseOut;
    const estimatedAmountOut =
      exactOutResponse.realAmountOut.amount.toNumber() /
      10 ** outputToken.decimals;
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

    return {
      poolAddress,
      estimatedAmountIn,
      estimatedAmountOut,
      maxAmountIn,
      minAmountOut: estimatedAmountOut,
      baseTokenBalanceChange: estimatedAmountOut,
      quoteTokenBalanceChange: -estimatedAmountIn,
      price,
      gasPrice: 0,
      gasLimit: 0,
      gasCost: 0,
    };
  } else {
    const exactInResponse = response as ReturnTypeComputeAmountOutFormat;
    const estimatedAmountIn =
      exactInResponse.realAmountIn.amount.raw.toNumber() /
      10 ** inputToken.decimals;
    const estimatedAmountOut =
      exactInResponse.amountOut.amount.raw.toNumber() /
      10 ** outputToken.decimals;
    const minAmountOut =
      exactInResponse.minAmountOut.amount.raw.toNumber() /
      10 ** outputToken.decimals;

    const price = estimatedAmountOut / estimatedAmountIn;

    return {
      poolAddress,
      estimatedAmountIn,
      estimatedAmountOut,
      minAmountOut,
      maxAmountIn: estimatedAmountIn,
      baseTokenBalanceChange: -estimatedAmountIn,
      quoteTokenBalanceChange: estimatedAmountOut,
      price,
      gasPrice: 0,
      gasLimit: 0,
      gasCost: 0,
    };
  }
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetSwapQuoteRequestType;
    Reply: GetSwapQuoteResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for Raydium CLMM',
        tags: ['raydium/clmm'],
        querystring: {
          ...GetSwapQuoteRequest,
          properties: {
            ...GetSwapQuoteRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.01] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            // poolAddress: { type: 'string', examples: [''] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: {
          200: {
            properties: {
              ...GetSwapQuoteResponse.properties,
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
          poolAddress: requestedPoolAddress,
          slippagePct,
        } = request.query;
        const networkToUse = network || 'mainnet-beta';

        const raydium = await Raydium.getInstance(networkToUse);
        let poolAddress = requestedPoolAddress;

        if (!poolAddress) {
          poolAddress = await raydium.findDefaultPool(
            baseToken,
            quoteToken,
            'clmm',
          );

          if (!poolAddress) {
            throw fastify.httpErrors.notFound(
              `No CLMM pool found for pair ${baseToken}-${quoteToken}`,
            );
          }
        }

        const result = await formatSwapQuote(
          fastify,
          networkToUse,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddress,
          slippagePct,
        );

        let gasEstimation = null;
        try {
          gasEstimation = await estimateGasSolana(fastify, networkToUse);
        } catch (error) {
          logger.warn(
            `Failed to estimate gas for swap quote: ${error.message}`,
          );
        }

        return {
          poolAddress,
          ...result,
          gasPrice: gasEstimation?.gasPrice,
          gasLimit: gasEstimation?.gasLimit,
          gasCost: gasEstimation?.gasCost,
        };
      } catch (e) {
        logger.error(e);
        // Preserve the original error if it's a FastifyError
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError(
          'Failed to get swap quote',
        );
      }
    },
  );
};

export default quoteSwapRoute;

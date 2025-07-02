import { SwapQuoteExactOut, SwapQuote } from '@meteora-ag/dlmm';
import { DecimalUtil } from '@orca-so/common-sdk';
import { BN } from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { estimateGasSolana } from '../../../chains/solana/routes/estimate-gas';
import { Solana } from '../../../chains/solana/solana';
import {
  GetSwapQuoteResponseType,
  GetSwapQuoteResponse,
  GetSwapQuoteRequestType,
  GetSwapQuoteRequest,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
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
): Promise<GetSwapQuoteResponseType> {
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
      baseTokenBalanceChange: amountOut,
      quoteTokenBalanceChange: -estimatedAmountIn,
      price,
      computeUnits: 0,
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
      baseTokenBalanceChange: baseTokenChange,
      quoteTokenBalanceChange: quoteTokenChange,
      price,
      computeUnits: 0,
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
        description: 'Get swap quote for Meteora CLMM',
        tags: ['meteora/clmm'],
        querystring: GetSwapQuoteRequest,
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
        const { network, baseToken, amount, side, poolAddress, slippagePct } =
          request.query;
        const networkUsed = network || 'mainnet-beta';
        const meteora = await Meteora.getInstance(networkUsed);

        // Get pool info to determine tokens
        const poolInfo = await meteora.getPoolInfo(poolAddress);
        if (!poolInfo) {
          throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
        }

        let baseTokenToUse: string;
        let quoteTokenToUse: string;

        // Determine which token is base and which is quote based on the provided baseToken
        if (baseToken === poolInfo.baseTokenAddress) {
          baseTokenToUse = poolInfo.baseTokenAddress;
          quoteTokenToUse = poolInfo.quoteTokenAddress;
        } else if (baseToken === poolInfo.quoteTokenAddress) {
          // User specified the quote token as base, so swap them
          baseTokenToUse = poolInfo.quoteTokenAddress;
          quoteTokenToUse = poolInfo.baseTokenAddress;
        } else {
          throw fastify.httpErrors.badRequest(
            `Token ${baseToken} not found in pool ${poolAddress}`,
          );
        }

        const result = await formatSwapQuote(
          fastify,
          networkUsed,
          baseTokenToUse,
          quoteTokenToUse,
          amount,
          side as 'BUY' | 'SELL',
          poolAddress,
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

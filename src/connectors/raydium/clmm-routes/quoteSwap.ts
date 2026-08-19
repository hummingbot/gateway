import { DecimalUtil } from '@orca-so/common-sdk';
import {
  PoolUtils,
  ReturnTypeComputeAmountOutFormat,
  ReturnTypeComputeAmountOutBaseOut,
} from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';
import { Decimal } from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { QuoteSwapResponseType, QuoteSwapResponse } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Raydium } from '../raydium';
import { RaydiumConfig } from '../raydium.config';

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
  // The SDK expects slippage as a fractional number (e.g. 0.02 for 2%).
  // Do NOT wrap in BN — new BN(0.02) truncates to 0, disabling slippage.
  const effectiveSlippageNumber = slippagePct / 100;

  // AmountOut = swapQuote, AmountOutBaseOut = swapQuoteExactOut
  const response: ReturnTypeComputeAmountOutFormat | ReturnTypeComputeAmountOutBaseOut =
    side === 'BUY'
      ? await PoolUtils.computeAmountIn({
          poolInfo: clmmPoolInfo,
          tickArrayCache: tickCache[poolAddress],
          amountOut: amount_bn,
          epochInfo: await raydium.raydiumSDK.fetchEpochInfo(),
          // baseMint denominates amountOut and the returned amountIn is in the
          // OTHER token. For a BUY we want `amount` of the output token, so
          // baseMint must be the output token; amountIn then comes back in the
          // input token's units directly (no inversion needed).
          baseMint: new PublicKey(outputToken.address),
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
    // With baseMint = output token, the SDK returns amountIn / maxAmountIn in the
    // input token's raw units. maxAmountIn already includes slippage.
    const estimatedAmountOut = exactOutResponse.realAmountOut.amount.toNumber() / 10 ** outputToken.decimals;
    const estimatedAmountIn = exactOutResponse.amountIn.amount.toNumber() / 10 ** inputToken.decimals;
    const maxAmountIn = exactOutResponse.maxAmountIn.amount.toNumber() / 10 ** inputToken.decimals;

    const price = estimatedAmountOut > 0 ? estimatedAmountIn / estimatedAmountOut : 0;

    // priceImpact is a Raydium SDK Percent object. Number(Percent) is NaN
    // ([object Object]), and toSignificant() already returns the value as a
    // percentage (e.g. 0.0326 means 0.0326%), so it must not be multiplied by 100.
    const priceImpactRaw = exactOutResponse.priceImpact ? Number(exactOutResponse.priceImpact.toSignificant(8)) : 0;
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

    // priceImpact is a Raydium SDK Percent object. Number(Percent) is NaN
    // ([object Object]), and toSignificant() already returns the value as a
    // percentage (e.g. 0.0326 means 0.0326%), so it must not be multiplied by 100.
    const priceImpactRaw = exactInResponse.priceImpact ? Number(exactInResponse.priceImpact.toSignificant(8)) : 0;
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

/**
 * Resolves the counter ("quote") token for a Raydium CLMM pool given the base token. The
 * standardized swap wrappers take poolAddress + baseToken and derive the other side from the pool
 * (mintA/mintB), so callers no longer pass quoteToken.
 */
export async function resolveCounterToken(network: string, poolAddress: string, baseToken: string): Promise<string> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);
  const [poolInfo] = await raydium.getClmmPoolfromAPI(poolAddress);
  if (!poolInfo) throw httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
  const mintA = poolInfo.mintA.address;
  const mintB = poolInfo.mintB.address;
  const resolved = await solana.getToken(baseToken);
  const baseAddr = resolved ? resolved.address : baseToken;
  if (baseAddr === mintA) return mintB;
  if (baseAddr === mintB) return mintA;
  throw httpErrors.badRequest(`Token ${baseToken} is not part of pool ${poolAddress}`);
}

/**
 * Standard CLMM quote-swap entry point (network-based) — consumed by the unified swap router.
 * Requires poolAddress; the quote token is derived from the pool.
 */
export async function quoteSwap(
  network: string,
  poolAddress: string,
  baseToken: string,
  side: 'BUY' | 'SELL',
  amount: number,
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<QuoteSwapResponseType> {
  const quoteToken = await resolveCounterToken(network, poolAddress, baseToken);
  return await formatSwapQuote(network, baseToken, quoteToken, amount, side, poolAddress, slippagePct);
}

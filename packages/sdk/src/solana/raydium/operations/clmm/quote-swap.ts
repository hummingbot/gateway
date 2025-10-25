/**
 * Raydium CLMM Quote Swap
 *
 * Quote operation to calculate swap amounts for CLMM pools.
 * Similar to AMM but uses concentrated liquidity (ticks).
 */

import { DecimalUtil } from '@orca-so/common-sdk';
import { PoolUtils } from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { QuoteSwapParams, QuoteSwapResult } from '../../types/clmm';

/**
 * Quote CLMM Swap
 *
 * Calculates swap amounts for CLMM pools:
 * - Fetches tick array data for liquidity calculation
 * - Supports exact input (SELL) and exact output (BUY)
 * - Returns amounts with slippage protection
 * - Calculates price impact
 *
 * @param raydium - Raydium connector instance
 * @param solana - Solana chain instance
 * @param params - Quote swap parameters
 * @returns Swap quote
 */
export async function quoteSwap(
  raydium: any,
  solana: any,
  params: QuoteSwapParams,
): Promise<QuoteSwapResult> {
  const { network, poolAddress, tokenIn, tokenOut, amountIn, amountOut, slippagePct } = params;

  // Determine side
  let side: 'BUY' | 'SELL';
  let amount: number;
  if (amountIn !== undefined) {
    side = 'SELL';
    amount = amountIn;
  } else if (amountOut !== undefined) {
    side = 'BUY';
    amount = amountOut;
  } else {
    throw new Error('Either amountIn or amountOut must be provided');
  }

  // Get pool info
  const [poolInfo] = await raydium.getClmmPoolfromAPI(poolAddress);
  if (!poolInfo) {
    throw new Error(`Pool not found: ${poolAddress}`);
  }

  // Resolve tokens
  const inputToken = await solana.getToken(tokenIn);
  const outputToken = await solana.getToken(tokenOut);

  if (!inputToken || !outputToken) {
    throw new Error(`Token not found: ${!inputToken ? tokenIn : tokenOut}`);
  }

  // Convert amount
  const amount_bn =
    side === 'BUY'
      ? DecimalUtil.toBN(new Decimal(amount), outputToken.decimals)
      : DecimalUtil.toBN(new Decimal(amount), inputToken.decimals);

  // Fetch CLMM pool info and tick arrays
  const clmmPoolInfo = await PoolUtils.fetchComputeClmmInfo({
    connection: solana.connection,
    poolInfo,
  });

  const tickCache = await PoolUtils.fetchMultiplePoolTickArrays({
    connection: solana.connection,
    poolKeys: [clmmPoolInfo],
  });

  const effectiveSlippageNumber = (slippagePct ?? 1) / 100;

  // Get swap quote
  const response =
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

  // Extract amounts based on response type
  let estimatedAmountIn: number;
  let estimatedAmountOut: number;
  let minAmountOut: number;
  let maxAmountIn: number;
  let priceImpactPct: number;

  if (side === 'BUY') {
    // ReturnTypeComputeAmountOutBaseOut
    const buyResponse = response as any;
    estimatedAmountIn = buyResponse.amountIn.amount.toNumber() / 10 ** inputToken.decimals;
    estimatedAmountOut = amount;
    minAmountOut = buyResponse.minAmountOut.amount.toNumber() / 10 ** outputToken.decimals;
    maxAmountIn = buyResponse.maxAmountIn.amount.toNumber() / 10 ** inputToken.decimals;
    priceImpactPct = buyResponse.priceImpact ? buyResponse.priceImpact.toNumber() * 100 : 0;
  } else {
    // ReturnTypeComputeAmountOutFormat
    const sellResponse = response as any;
    estimatedAmountIn = amount;
    estimatedAmountOut = sellResponse.amountOut.amount.toNumber() / 10 ** outputToken.decimals;
    minAmountOut = sellResponse.minAmountOut.amount.toNumber() / 10 ** outputToken.decimals;
    maxAmountIn = sellResponse.realAmountIn.amount.toNumber() / 10 ** inputToken.decimals;
    priceImpactPct = sellResponse.priceImpact ? sellResponse.priceImpact.toNumber() * 100 : 0;
  }

  const price = estimatedAmountOut / estimatedAmountIn;

  return {
    poolAddress,
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    amountIn: estimatedAmountIn,
    amountOut: estimatedAmountOut,
    price,
    slippagePct: slippagePct ?? 1,
    minAmountOut,
    maxAmountIn,
    priceImpact: priceImpactPct / 100, // Convert from percentage to decimal
    priceImpactPct,
  };
}

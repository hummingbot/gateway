/**
 * Meteora Quote Swap Operation
 *
 * Gets a swap quote for trading on a Meteora DLMM pool.
 */

import { SwapQuote, SwapQuoteExactOut } from '@meteora-ag/dlmm';
import { DecimalUtil } from '@orca-so/common-sdk';
import { BN } from 'bn.js';
import { Decimal } from 'decimal.js';

import { QuoteSwapParams, QuoteSwapResult } from '../../types';

/**
 * Get raw swap quote from Meteora
 *
 * Helper function that returns the raw quote object for use in execute-swap.
 */
export async function getRawSwapQuote(
  meteora: any,
  _solana: any,
  poolAddress: string,
  inputToken: any,
  outputToken: any,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number,
) {
  const dlmmPool = await meteora.getDlmmPool(poolAddress);
  if (!dlmmPool) {
    throw new Error(`Pool not found: ${poolAddress}`);
  }

  const amount_bn =
    side === 'BUY'
      ? DecimalUtil.toBN(new Decimal(amount), outputToken.decimals)
      : DecimalUtil.toBN(new Decimal(amount), inputToken.decimals);

  const swapForY = inputToken.address === dlmmPool.tokenX.publicKey.toBase58();
  const binArrays = await dlmmPool.getBinArrayForSwap(swapForY);
  const effectiveSlippage = new BN(slippagePct * 100);

  const quote =
    side === 'BUY'
      ? dlmmPool.swapQuoteExactOut(amount_bn, swapForY, effectiveSlippage, binArrays)
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

/**
 * Get swap quote
 *
 * This is a query operation (read-only).
 * Returns expected amounts and price for a swap.
 *
 * @param meteora Meteora connector instance
 * @param solana Solana chain instance
 * @param params Quote swap parameters
 * @returns Swap quote with amounts and price
 */
export async function getSwapQuote(
  meteora: any, // Meteora connector
  solana: any,  // Solana chain
  params: QuoteSwapParams,
): Promise<QuoteSwapResult> {
  const {
    poolAddress,
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    slippagePct = 1,
  } = params;

  if (!amountIn && !amountOut) {
    throw new Error('Either amountIn or amountOut must be provided');
  }

  const side = amountOut ? 'BUY' : 'SELL';
  const amount = (amountOut || amountIn)!;

  // Get token info
  const inputToken = await solana.getToken(tokenIn);
  const outputToken = await solana.getToken(tokenOut);

  if (!inputToken || !outputToken) {
    throw new Error(`Token not found: ${!inputToken ? tokenIn : tokenOut}`);
  }

  const { quote, dlmmPool } = await getRawSwapQuote(
    meteora,
    solana,
    poolAddress,
    inputToken,
    outputToken,
    amount,
    side,
    slippagePct,
  );

  // Format quote based on swap type
  let estimatedAmountIn: number;
  let estimatedAmountOut: number;
  let minAmountOut: number;
  let maxAmountIn: number;

  if (side === 'BUY') {
    const exactOutQuote = quote as SwapQuoteExactOut;
    estimatedAmountIn = DecimalUtil.fromBN(exactOutQuote.inAmount, inputToken.decimals).toNumber();
    maxAmountIn = DecimalUtil.fromBN(exactOutQuote.maxInAmount, inputToken.decimals).toNumber();
    estimatedAmountOut = DecimalUtil.fromBN(exactOutQuote.outAmount, outputToken.decimals).toNumber();
    minAmountOut = estimatedAmountOut;
  } else {
    const exactInQuote = quote as SwapQuote;
    estimatedAmountIn = DecimalUtil.fromBN(exactInQuote.consumedInAmount, inputToken.decimals).toNumber();
    estimatedAmountOut = DecimalUtil.fromBN(exactInQuote.outAmount, outputToken.decimals).toNumber();
    minAmountOut = DecimalUtil.fromBN(exactInQuote.minOutAmount, outputToken.decimals).toNumber();
    maxAmountIn = estimatedAmountIn;
  }

  const price = estimatedAmountOut / estimatedAmountIn;

  // Get fee info
  const feeInfo = await dlmmPool.getFeeInfo();
  const feePct = Number(feeInfo.baseFeeRatePercentage);

  return {
    poolAddress,
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    amountIn: estimatedAmountIn,
    amountOut: estimatedAmountOut,
    price,
    priceImpactPct: 0, // TODO: Calculate actual price impact
    minAmountOut,
    maxAmountIn,
    feePct,
  };
}

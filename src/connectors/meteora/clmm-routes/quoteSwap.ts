import { SwapQuoteExactOut, SwapQuote } from '@meteora-ag/dlmm';
import { DecimalUtil } from '@orca-so/common-sdk';
import { BN } from 'bn.js';
import { Decimal } from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { QuoteSwapResponseType, QuoteSwapResponse } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { Meteora } from '../meteora';
import { MeteoraConfig } from '../meteora.config';

export async function getRawSwapQuote(
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct: number = MeteoraConfig.config.slippagePct,
) {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const baseToken = await solana.getToken(baseTokenSymbol);
  const quoteToken = await solana.getToken(quoteTokenSymbol);

  if (!baseToken || !quoteToken) {
    throw httpErrors.notFound(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
  }

  const dlmmPool = await meteora.getDlmmPool(poolAddress);
  if (!dlmmPool) {
    throw httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  // For buy orders, we're swapping quote token for base token (ExactOut)
  // For sell orders, we're swapping base token for quote token (ExactIn)
  const [inputToken, outputToken] = side === 'BUY' ? [quoteToken, baseToken] : [baseToken, quoteToken];

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

async function formatSwapQuote(
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct: number = MeteoraConfig.config.slippagePct,
): Promise<QuoteSwapResponseType> {
  const { inputToken, outputToken, quote, dlmmPool } = await getRawSwapQuote(
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
    throw httpErrors.notFound('Failed to get pool tokens');
  }

  if (side === 'BUY') {
    const exactOutQuote = quote as SwapQuoteExactOut;
    const estimatedAmountIn = DecimalUtil.fromBN(exactOutQuote.inAmount, inputToken.decimals).toNumber();
    const maxAmountIn = DecimalUtil.fromBN(exactOutQuote.maxInAmount, inputToken.decimals).toNumber();
    const amountOut = DecimalUtil.fromBN(exactOutQuote.outAmount, outputToken.decimals).toNumber();

    // Always quote/base regardless of side. On BUY the input token is the
    // quote and the output token is the base, so price = in/out = quote/base.
    // The previous `amountOut / estimatedAmountIn` returned base/quote on BUY
    // and quote/base on SELL — so BUY quotes appeared at a different scale.
    const price = amountOut > 0 ? estimatedAmountIn / amountOut : 0;

    return {
      // Base QuoteSwapResponse fields in correct order
      poolAddress,
      tokenIn: inputToken.address,
      tokenOut: outputToken.address,
      amountIn: estimatedAmountIn,
      amountOut: amountOut,
      price,
      slippagePct,
      minAmountOut: amountOut,
      maxAmountIn,
      // CLMM-specific fields
      priceImpactPct: 0, // TODO: Calculate actual price impact
    };
  } else {
    const exactInQuote = quote as SwapQuote;
    const estimatedAmountIn = DecimalUtil.fromBN(exactInQuote.consumedInAmount, inputToken.decimals).toNumber();
    const estimatedAmountOut = DecimalUtil.fromBN(exactInQuote.outAmount, outputToken.decimals).toNumber();
    const minAmountOut = DecimalUtil.fromBN(exactInQuote.minOutAmount, outputToken.decimals).toNumber();

    // For sell orders:
    // - Base token (input) decreases (negative)
    // - Quote token (output) increases (positive)
    const baseTokenChange = -estimatedAmountIn;
    const quoteTokenChange = estimatedAmountOut;

    const price = estimatedAmountOut / estimatedAmountIn;

    return {
      // Base QuoteSwapResponse fields in correct order
      poolAddress,
      tokenIn: inputToken.address,
      tokenOut: outputToken.address,
      amountIn: estimatedAmountIn,
      amountOut: estimatedAmountOut,
      price,
      slippagePct,
      minAmountOut,
      maxAmountIn: estimatedAmountIn,
      // CLMM-specific fields
      priceImpactPct: 0, // TODO: Calculate actual price impact
    };
  }
}

/**
 * Resolves the counter ("quote") token for a DLMM pool given the base token. The standardized swap
 * wrappers take poolAddress + baseToken and derive the other side from the pool (tokenX/tokenY),
 * so callers no longer pass quoteToken.
 */
export async function resolveCounterToken(network: string, poolAddress: string, baseToken: string): Promise<string> {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const dlmmPool = await meteora.getDlmmPool(poolAddress);
  if (!dlmmPool) throw httpErrors.notFound(`Pool not found: ${poolAddress}`);
  const tokenXAddr = dlmmPool.tokenX.publicKey.toBase58();
  const tokenYAddr = dlmmPool.tokenY.publicKey.toBase58();
  const resolved = await solana.getToken(baseToken);
  const baseAddr = resolved ? resolved.address : baseToken;
  if (baseAddr === tokenXAddr) return tokenYAddr;
  if (baseAddr === tokenYAddr) return tokenXAddr;
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
  slippagePct?: number,
): Promise<QuoteSwapResponseType> {
  const quoteToken = await resolveCounterToken(network, poolAddress, baseToken);
  return await formatSwapQuote(network, baseToken, quoteToken, amount, side, poolAddress, slippagePct);
}

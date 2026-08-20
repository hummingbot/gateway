import { PoolState } from '@meteora-ag/cp-amm-sdk';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';

import { QuoteLiquidityResponseType } from '../../../schemas/amm-schema';
import { MeteoraDamm } from '../meteora-damm';
import { MeteoraConfig } from '../meteora.config';

/** A resolved deposit quote: which side limits the deposit, the amounts, and the liquidity delta. */
export interface LiquidityQuote {
  baseLimited: boolean;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  baseTokenAmountMax: number;
  quoteTokenAmountMax: number;
  liquidityDelta: BN;
  maxAmountTokenA: BN;
  maxAmountTokenB: BN;
  tokenADecimal: number;
  tokenBDecimal: number;
}

function toRaw(amount: number, decimals: number): BN {
  return new BN(new Decimal(amount).mul(new Decimal(10).pow(decimals)).toFixed(0));
}

function toUi(raw: BN, decimals: number): number {
  return new Decimal(raw.toString()).div(new Decimal(10).pow(decimals)).toNumber();
}

function withSlippageUp(raw: BN, slippagePct: number): BN {
  return new BN(new Decimal(raw.toString()).mul(1 + slippagePct / 100).toFixed(0));
}

/**
 * Computes the deposit quote for a DAMM v2 pool. Deposits are two-sided at the current price;
 * one token limits the deposit and the other is derived. `base` = token A, `quote` = token B.
 */
export async function getLiquidityQuote(
  meteoraDamm: MeteoraDamm,
  poolState: PoolState,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number,
): Promise<LiquidityQuote> {
  const { tokenADecimal, tokenBDecimal } = await meteoraDamm.getTokenDecimals(poolState);
  const baseRaw = toRaw(baseTokenAmount, tokenADecimal);
  const quoteRaw = toRaw(quoteTokenAmount, tokenBDecimal);

  const common = {
    minSqrtPrice: poolState.sqrtMinPrice,
    maxSqrtPrice: poolState.sqrtMaxPrice,
    sqrtPrice: poolState.sqrtPrice,
    collectFeeMode: poolState.collectFeeMode,
    tokenAAmount: poolState.tokenAAmount,
    tokenBAmount: poolState.tokenBAmount,
    liquidity: poolState.liquidity,
  };

  // Quote from each side; the side yielding the smaller liquidity delta is the limiting one.
  const fromBase = meteoraDamm.cpAmm.getDepositQuote({ ...common, inAmount: baseRaw, isTokenA: true });
  const fromQuote = meteoraDamm.cpAmm.getDepositQuote({ ...common, inAmount: quoteRaw, isTokenA: false });

  const baseLimited = fromBase.liquidityDelta.lte(fromQuote.liquidityDelta);

  if (baseLimited) {
    // Consume all base; the required quote is fromBase.outputAmount.
    const requiredQuoteRaw = fromBase.outputAmount;
    const maxAmountTokenB = withSlippageUp(requiredQuoteRaw, slippagePct);
    return {
      baseLimited: true,
      baseTokenAmount,
      quoteTokenAmount: toUi(requiredQuoteRaw, tokenBDecimal),
      baseTokenAmountMax: baseTokenAmount,
      quoteTokenAmountMax: toUi(maxAmountTokenB, tokenBDecimal),
      liquidityDelta: fromBase.liquidityDelta,
      maxAmountTokenA: baseRaw,
      maxAmountTokenB,
      tokenADecimal,
      tokenBDecimal,
    };
  }

  // Consume all quote; the required base is fromQuote.outputAmount.
  const requiredBaseRaw = fromQuote.outputAmount;
  const maxAmountTokenA = withSlippageUp(requiredBaseRaw, slippagePct);
  return {
    baseLimited: false,
    baseTokenAmount: toUi(requiredBaseRaw, tokenADecimal),
    quoteTokenAmount,
    baseTokenAmountMax: toUi(maxAmountTokenA, tokenADecimal),
    quoteTokenAmountMax: quoteTokenAmount,
    liquidityDelta: fromQuote.liquidityDelta,
    maxAmountTokenA,
    maxAmountTokenB: quoteRaw,
    tokenADecimal,
    tokenBDecimal,
  };
}

/**
 * Standard AMM quote-liquidity entry point (network-based) — consumed by the unified /trading/amm
 * dispatcher. Wraps getLiquidityQuote and shapes it into the shared QuoteLiquidityResponse.
 */
export async function quoteLiquidity(
  network: string,
  poolAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct?: number,
): Promise<QuoteLiquidityResponseType> {
  const meteoraDamm = await MeteoraDamm.getInstance(network);
  const poolState = await meteoraDamm.getPoolState(poolAddress);
  const effectiveSlippage = slippagePct ?? MeteoraConfig.config.slippagePct;
  const quote = await getLiquidityQuote(meteoraDamm, poolState, baseTokenAmount, quoteTokenAmount, effectiveSlippage);
  return {
    baseLimited: quote.baseLimited,
    baseTokenAmount: quote.baseTokenAmount,
    quoteTokenAmount: quote.quoteTokenAmount,
    baseTokenAmountMax: quote.baseTokenAmountMax,
    quoteTokenAmountMax: quote.quoteTokenAmountMax,
  };
}

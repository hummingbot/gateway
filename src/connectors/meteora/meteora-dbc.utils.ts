import BN from 'bn.js';
import { Decimal } from 'decimal.js';

/** Convert a UI amount to raw units without float drift. */
export function toRawAmount(amount: number, decimals: number): BN {
  return new BN(new Decimal(amount).mul(new Decimal(10).pow(decimals)).toFixed(0));
}

/** Convert raw units back to a UI amount. */
export function fromRawAmount(amount: BN, decimals: number): number {
  return new Decimal(amount.toString()).div(new Decimal(10).pow(decimals)).toNumber();
}

/**
 * Price impact of a swap as a percentage: how far the fee-free execution price sits
 * from the spot price the pool quoted before the trade, the way routers report it.
 */
export function priceImpactPct(spotPrice: number, executionPrice: number): number {
  if (spotPrice <= 0) return 0;
  return Math.abs(executionPrice / spotPrice - 1) * 100;
}

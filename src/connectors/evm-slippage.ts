/**
 * A slippage percentage as the basis-point numerator the EVM SDKs' `Percent(n, 10000)`
 * takes.
 *
 * Uniswap and PancakeSwap each ship their own `Percent` class, so this returns the
 * numerator rather than a Percent: the call site builds its own SDK's type. The reason it
 * is a function at all is that the four CLMM liquidity routes used to write
 * `new Percent(100, 10000)` — a flat 1% that ignored both the caller's slippagePct and the
 * operator's configured one. Rounding to whole basis points is what the denominator
 * implies; a tolerance finer than 0.01% is not expressible against it.
 */
export function slippageBasisPoints(slippagePct: number): number {
  return Math.round(slippagePct * 100);
}

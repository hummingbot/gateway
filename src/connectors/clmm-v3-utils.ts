import { Contract } from '@ethersproject/contracts';

import { BinLiquidity } from '../schemas/clmm-schema';

/**
 * Per-bin liquidity distribution around the current tick for a Uniswap-V3-style
 * pool. Shared by the Uniswap and PancakeSwap connectors — PancakeSwap V3 is a
 * Uniswap V3 fork with identical tick semantics, so the walk is the same; each
 * connector passes its own SDK's math implementations rather than depending on
 * the other's.
 *
 * V3 has no equivalent of Orca's "fetch all positions for pool" RPC — positions
 * are NFTs on the position manager. Instead we walk the pool's per-tick
 * liquidity profile directly:
 *
 *   1. Read `liquidityNet` at every bin boundary in the window via parallel
 *      `pool.ticks(tick)` reads (one eth_call each, fired with Promise.all).
 *      Ticks that have never been initialized return zeros — that's harmless.
 *   2. Start with the pool's active L = pool.liquidity() in the bin that
 *      contains the current tick. Propagate L outward by adding/subtracting
 *      `liquidityNet` at each boundary crossed (per the V3 spec).
 *   3. For each bin, convert L → (amount0, amount1) via
 *      getAmount{0,1}Delta(sqrtA, sqrtB, L, false), splitting at the pool's
 *      current sqrtPriceX96 when the bin straddles the active tick.
 *   4. Map to base/quote using `isBaseToken0`, scale by decimals.
 *
 * Output shape mirrors Meteora's `pool-info.bins[]`.
 */

// Structural types for the V3 SDK math, in native bigint. The SDKs disagree on
// their numeric type — @uniswap/v3-sdk is JSBI-based, @pancakeswap/v3-sdk uses
// native bigint — so each connector adapts its own SDK to this interface rather
// than one connector importing the other's math.
export interface V3TickMath {
  getSqrtRatioAtTick(tick: number): bigint;
}

export interface V3SqrtPriceMath {
  getAmount0Delta(sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, liquidity: bigint, roundUp: boolean): bigint;
  getAmount1Delta(sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, liquidity: bigint, roundUp: boolean): bigint;
}

export async function computeV3BinDistribution(args: {
  poolContract: Contract;
  tickSpacing: number;
  currentTick: number;
  currentSqrtPriceX96: bigint;
  activeLiquidity: bigint;
  decimals0: number;
  decimals1: number;
  isBaseToken0: boolean;
  binCount: number;
  tickMath: V3TickMath;
  sqrtPriceMath: V3SqrtPriceMath;
}): Promise<BinLiquidity[]> {
  const {
    poolContract,
    tickSpacing,
    currentTick,
    currentSqrtPriceX96,
    activeLiquidity,
    decimals0,
    decimals1,
    isBaseToken0,
    binCount,
    tickMath,
    sqrtPriceMath,
  } = args;
  if (binCount <= 0) return [];

  const halfBins = Math.floor(binCount / 2);
  const snapped = Math.floor(currentTick / tickSpacing) * tickSpacing;
  const firstBinStart = snapped - halfBins * tickSpacing;
  const boundaries: number[] = [];
  for (let i = 0; i <= binCount; i++) {
    boundaries.push(firstBinStart + i * tickSpacing);
  }

  // Parallel reads of pool.ticks(tick) at each boundary. Non-initialized
  // ticks return zeros which is the correct neutral element for liquidityNet.
  const tickData = await Promise.all(
    boundaries.map((tick) => poolContract.ticks(tick).catch(() => ({ liquidityNet: 0 }))),
  );

  const curIdx = Math.floor((currentTick - firstBinStart) / tickSpacing);

  // Propagate L outward from the current bin (V3 spec: crossing a tick going
  // UP adds liquidityNet, going DOWN subtracts it).
  const binLs: bigint[] = new Array(binCount);
  binLs[curIdx] = activeLiquidity;
  for (let i = curIdx + 1; i < binCount; i++) {
    const net = BigInt(tickData[i].liquidityNet.toString());
    binLs[i] = binLs[i - 1] + net;
  }
  for (let i = curIdx - 1; i >= 0; i--) {
    const net = BigInt(tickData[i + 1].liquidityNet.toString());
    binLs[i] = binLs[i + 1] - net;
  }

  const scale0 = Math.pow(10, decimals0);
  const scale1 = Math.pow(10, decimals1);
  const zero = 0n;
  const bins: BinLiquidity[] = [];
  for (let i = 0; i < binCount; i++) {
    const tickStart = boundaries[i];
    const tickEnd = boundaries[i + 1];
    const L = binLs[i];
    let amount0: bigint = zero;
    let amount1: bigint = zero;
    if (L > zero) {
      const sqrtA = tickMath.getSqrtRatioAtTick(tickStart);
      const sqrtB = tickMath.getSqrtRatioAtTick(tickEnd);
      if (currentTick >= tickEnd) {
        amount1 = sqrtPriceMath.getAmount1Delta(sqrtA, sqrtB, L, false);
      } else if (currentTick < tickStart) {
        amount0 = sqrtPriceMath.getAmount0Delta(sqrtA, sqrtB, L, false);
      } else {
        amount0 = sqrtPriceMath.getAmount0Delta(currentSqrtPriceX96, sqrtB, L, false);
        amount1 = sqrtPriceMath.getAmount1Delta(sqrtA, currentSqrtPriceX96, L, false);
      }
    }
    const amt0 = parseFloat(amount0.toString()) / scale0;
    const amt1 = parseFloat(amount1.toString()) / scale1;
    const baseTokenAmount = isBaseToken0 ? amt0 : amt1;
    const quoteTokenAmount = isBaseToken0 ? amt1 : amt0;

    // Price at tickStart in human units (quote/base regardless of token order).
    const rawT1PerT0 = Math.pow(1.0001, tickStart) * Math.pow(10, decimals0 - decimals1);
    const price = isBaseToken0 ? rawT1PerT0 : 1 / rawT1PerT0;
    bins.push({
      binId: tickStart,
      price,
      baseTokenAmount,
      quoteTokenAmount,
    });
  }
  return bins;
}

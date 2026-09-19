import { Contract } from '@ethersproject/contracts';
import { BigNumberish } from 'ethers';

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

/** Initialized-tick reads per round trip, to stay clear of node rate limits. */
const TICK_READ_BATCH = 25;
const TICK_READ_RETRIES = 4;

/**
 * Read a batch of ticks, retrying transport failures.
 *
 * These are idempotent reads of a public mapping, so a retry is safe. Nothing is
 * substituted for a read that never succeeds: after the last attempt the error
 * propagates, because a missing liquidityNet quietly treated as zero is exactly what
 * produced a confidently wrong liquidity profile before.
 */
async function readTicksWithRetry(poolContract: Contract, ticks: number[]): Promise<{ liquidityNet: BigNumberish }[]> {
  let delayMs = 250;
  for (let attempt = 0; ; attempt++) {
    try {
      return await Promise.all(ticks.map((tick) => poolContract.ticks(tick)));
    } catch (error) {
      if (attempt >= TICK_READ_RETRIES) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs *= 2;
    }
  }
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

  // liquidityNet at each boundary, asking the tick bitmap which boundaries have one.
  //
  // The bitmap reports which boundaries are initialized, one bit per tickSpacing, so the
  // window costs a couple of word reads plus one call per tick that actually carries
  // liquidity. A boundary the bitmap reports as uninitialized has liquidityNet zero by
  // definition, so not reading it loses nothing.
  //
  // How much this saves depends entirely on the pool, and on the busiest pools it saves
  // nothing. Measured over a 401-bin window on mainnet: WETH/USDC 0.3% had 400 of 402
  // boundaries initialized (0% fewer calls), WETH/USDC 0.05% 396 of 402 (1%), WBTC/WETH
  // 0.3% 311 of 402 (22%), USDC/USDT 0.01% 100 of 402 (75%). So this is a real win on
  // sparse pools and a no-op on dense ones — it is not what keeps a wide binCount under a
  // node's rate limit. That is the batching and backoff below, and on a limit as tight as
  // a public endpoint's a large binCount can still legitimately fail with a 429.
  //
  // This previously read all of them at once and caught each rejection as
  // `liquidityNet: 0`. Both getters cannot revert for in-range inputs, so every rejection
  // it caught was a transport failure, and recording one as "no liquidity change here"
  // silently flattens the profile into a plausible wrong answer rather than an error.
  // Measured against a node rate-limiting the 401 concurrent calls, a pool whose liquidity
  // truly falls to 7% of its value at spot by +10% reported 94% — a flat curve where the
  // real one drops twelvefold, with nothing in the response to indicate it. Rejections now
  // propagate instead, so a rate-limited read fails loudly rather than flattening the curve.
  const wordOf = (tick: number) => Math.floor(Math.floor(tick / tickSpacing) / 256);
  const words: number[] = [];
  for (let word = wordOf(boundaries[0]); word <= wordOf(boundaries[boundaries.length - 1]); word++) {
    words.push(word);
  }
  const bitmaps = await Promise.all(words.map((word) => poolContract.tickBitmap(word)));
  const initialized = new Set<number>();
  bitmaps.forEach((bitmap, index) => {
    const bits = BigInt(bitmap.toString());
    for (let bit = 0; bit < 256; bit++) {
      if ((bits >> BigInt(bit)) & 1n) {
        initialized.add((words[index] * 256 + bit) * tickSpacing);
      }
    }
  });

  const live = boundaries.filter((tick) => initialized.has(tick));
  const liquidityNets = new Map<number, BigNumberish>();
  for (let i = 0; i < live.length; i += TICK_READ_BATCH) {
    const batch = live.slice(i, i + TICK_READ_BATCH);
    const read = await readTicksWithRetry(poolContract, batch);
    batch.forEach((tick, j) => liquidityNets.set(tick, read[j].liquidityNet));
  }
  const tickData = boundaries.map((tick) => ({ liquidityNet: liquidityNets.get(tick) ?? 0 }));

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

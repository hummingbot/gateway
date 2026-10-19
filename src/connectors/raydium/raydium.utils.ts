import {
  AMM_V4,
  AMM_STABLE,
  CLMM_PROGRAM_ID,
  DEVNET_PROGRAM_ID,
  CREATE_CPMM_POOL_PROGRAM,
  LiquidityMathUtil,
  PoolUtils,
  TickArrayUtil,
  TickUtil,
  ApiV3PoolInfoConcentratedItem,
  ClmmKeys,
} from '@raydium-io/raydium-sdk-v2';

const VALID_AMM_PROGRAM_ID = new Set([
  AMM_V4.toBase58(),
  AMM_STABLE.toBase58(),
  DEVNET_PROGRAM_ID.AMM_V4.toBase58(),
  DEVNET_PROGRAM_ID.AMM_STABLE.toBase58(),
]);

const VALID_CLMM_PROGRAM_ID = new Set([CLMM_PROGRAM_ID.toBase58(), DEVNET_PROGRAM_ID.CLMM_PROGRAM_ID.toBase58()]);

const VALID_CPMM_PROGRAM_ID = new Set([
  CREATE_CPMM_POOL_PROGRAM.toBase58(),
  DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM.toBase58(),
]);

export const isValidClmm = (id: string) => VALID_CLMM_PROGRAM_ID.has(id);
export const isValidAmm = (id: string) => VALID_AMM_PROGRAM_ID.has(id);
export const isValidCpmm = (id: string) => VALID_CPMM_PROGRAM_ID.has(id);

/**
 * The tick a price maps to on a CLMM pool, rounded onto the pool's tick
 * spacing AWAY from zero (a positive tick rounds up, a negative one down).
 * This is the rounding Gateway has always opened positions with; the SDK's own
 * `TickUtil.getPriceAndTick` floors instead, which would move a range's bound
 * by one spacing for every positive tick.
 */
export function priceToTick(price: Decimal, tickSpacing: number, decimalsA: number, decimalsB: number): number {
  const sqrtPriceX64 = new BN(
    price
      .mul(Decimal.pow(10, decimalsB - decimalsA))
      .sqrt()
      .mul(Decimal.pow(2, 64))
      .floor()
      .toFixed(),
  );
  const ratio = TickUtil.getTickAtSqrtPrice(sqrtPriceX64) / tickSpacing;
  return (ratio < 0 ? Math.floor(ratio) : Math.ceil(ratio)) * tickSpacing;
}

/** A tick's price (quote per base) at full precision; the SDK's `tickToPrice` truncates tiny prices. */
export function tickToPrice(tick: number, decimalsA: number, decimalsB: number): Decimal {
  return new Decimal(TickUtil.getSqrtPriceAtTick(tick).toString())
    .div(Decimal.pow(2, 64))
    .pow(2)
    .mul(Decimal.pow(10, decimalsA - decimalsB));
}

/**
 * Find a pool address for a token pair in the configured pools
 *
 * @param baseToken Base token symbol
 * @param quoteToken Quote token symbol
 * @param poolType Type of pool ('amm' or 'clmm')
 * @param network Network name (defaults to 'mainnet-beta')
 * @returns Pool address or null if not found
 */
export const findPoolAddress = (
  _baseToken: string,
  _quoteToken: string,
  _poolType: 'amm' | 'clmm',
  _network: string = 'mainnet-beta',
): string | null => {
  // Pools are now managed separately, return null for dynamic pool discovery
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-bin liquidity distribution helper
// ─────────────────────────────────────────────────────────────────────────────

import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';

import { logger } from '../../services/logger';

/**
 * Per-bin liquidity distribution around the current tick for a Raydium V3
 * (CLMM) pool. Mirrors Meteora's `pool-info.bins[]` shape and the same helper
 * exposed in the Orca/Uniswap connectors:
 *
 *     { binId, price, baseTokenAmount, quoteTokenAmount }
 *
 * How it works
 * ------------
 * 1. Fetch all tick arrays for the pool via `PoolUtils.fetchMultiplePoolTickArrays`
 *    (one getProgramAccounts under the hood; the cache is keyed by tick-array
 *    start index).
 * 2. For each bin boundary in the window, derive its `TickArray.startTickIndex`
 *    + the tick's offset inside that array; pull out the `liquidityNet` field.
 * 3. Propagate L outward from the current bin (`pool.liquidity` at currentTick).
 *    Per V3 spec: crossing a tick going UP adds liquidityNet, going DOWN
 *    subtracts it.
 * 4. Apply V3 sqrt-price math via `LiquidityMathUtil.getDeltaAmount{A,B}Unsigned`
 *    splitting at the active sqrtPrice when the bin contains the current tick.
 */
export interface RaydiumBinDistributionEntry {
  binId: number;
  price: number;
  baseTokenAmount: number;
  quoteTokenAmount: number;
}

export async function computeRaydiumBinDistribution(args: {
  connection: Connection;
  poolInfo: ApiV3PoolInfoConcentratedItem;
  poolKeys: ClmmKeys;
  tickSpacing: number;
  currentTick: number;
  currentSqrtPriceX64: BN;
  activeLiquidity: BN;
  decimalsA: number;
  decimalsB: number;
  binCount: number;
}): Promise<RaydiumBinDistributionEntry[]> {
  const {
    connection,
    poolInfo,
    poolKeys,
    tickSpacing,
    currentTick,
    currentSqrtPriceX64,
    activeLiquidity,
    decimalsA,
    decimalsB,
    binCount,
  } = args;
  if (binCount <= 0) return [];

  // Snap bin grid so the current tick lands inside a bin.
  const halfBins = Math.floor(binCount / 2);
  const snapped = Math.floor(currentTick / tickSpacing) * tickSpacing;
  const firstBinStart = snapped - halfBins * tickSpacing;
  const boundaries: number[] = [];
  for (let i = 0; i <= binCount; i++) {
    boundaries.push(firstBinStart + i * tickSpacing);
  }

  // Fetch all of the pool's tick arrays. The SDK builds `ComputeClmmPoolInfo`
  // from the API-shape poolInfo we already have; `fetchMultiplePoolTickArrays`
  // returns `{ [poolId]: { [startTickIndex]: TickArray } }`.
  let clmmPoolInfo: any;
  let tickCache: any;
  try {
    clmmPoolInfo = await PoolUtils.fetchComputeClmmInfo({ connection, poolInfo });
    tickCache = await PoolUtils.fetchMultiplePoolTickArrays({
      connection,
      poolKeys: [clmmPoolInfo],
    });
  } catch (e) {
    logger.warning(`Raydium bin fetch failed for ${poolInfo.id}: ${e}`);
    return [];
  }
  const poolTickArrays = tickCache?.[poolInfo.id.toString()] ?? tickCache?.[poolInfo.id] ?? {};

  const programId = new PublicKey(poolInfo.programId);
  const poolId = new PublicKey(poolInfo.id);

  // Helper: look up the on-chain Tick struct for a boundary; if uninitialized,
  // return a neutral { liquidityNet: 0 }.
  const tickAt = (tickIndex: number): { liquidityNet: BN } => {
    try {
      const startIndex = TickArrayUtil.getTickArrayStartIndex(tickIndex, tickSpacing);
      const arr = poolTickArrays[startIndex];
      if (!arr || !arr.ticks) return { liquidityNet: new BN(0) };
      const offset = TickArrayUtil.getTickOffsetInArray(tickIndex, tickSpacing);
      const t = arr.ticks?.[offset];
      if (!t || !t.liquidityNet) return { liquidityNet: new BN(0) };
      return { liquidityNet: t.liquidityNet };
    } catch {
      return { liquidityNet: new BN(0) };
    }
  };
  // Suppress unused warnings for the program/pool ids (kept for future PDA derivation).
  void programId;
  void poolId;
  void poolKeys;

  const curIdx = Math.floor((currentTick - firstBinStart) / tickSpacing);

  // Propagate L outward from the current bin.
  const binLs: BN[] = new Array(binCount);
  binLs[curIdx] = activeLiquidity;
  for (let i = curIdx + 1; i < binCount; i++) {
    binLs[i] = binLs[i - 1].add(tickAt(boundaries[i]).liquidityNet);
  }
  for (let i = curIdx - 1; i >= 0; i--) {
    binLs[i] = binLs[i + 1].sub(tickAt(boundaries[i + 1]).liquidityNet);
  }

  const scaleA = Math.pow(10, decimalsA);
  const scaleB = Math.pow(10, decimalsB);
  const zero = new BN(0);
  const bins: RaydiumBinDistributionEntry[] = [];
  for (let i = 0; i < binCount; i++) {
    const tickStart = boundaries[i];
    const tickEnd = boundaries[i + 1];
    const L = binLs[i];
    let rawA: BN = zero;
    let rawB: BN = zero;
    if (L.gt(zero)) {
      const sqrtA: BN = TickUtil.getSqrtPriceAtTick(tickStart);
      const sqrtB: BN = TickUtil.getSqrtPriceAtTick(tickEnd);
      if (currentTick >= tickEnd) {
        rawB = LiquidityMathUtil.getDeltaAmountBUnsigned(sqrtA, sqrtB, L, false);
      } else if (currentTick < tickStart) {
        rawA = LiquidityMathUtil.getDeltaAmountAUnsigned(sqrtA, sqrtB, L, false);
      } else {
        rawA = LiquidityMathUtil.getDeltaAmountAUnsigned(currentSqrtPriceX64, sqrtB, L, false);
        rawB = LiquidityMathUtil.getDeltaAmountBUnsigned(sqrtA, currentSqrtPriceX64, L, false);
      }
    }
    bins.push({
      binId: tickStart,
      price: Math.pow(1.0001, tickStart) * Math.pow(10, decimalsA - decimalsB),
      baseTokenAmount: parseFloat(rawA.toString()) / scaleA,
      quoteTokenAmount: parseFloat(rawB.toString()) / scaleB,
    });
  }
  return bins;
}

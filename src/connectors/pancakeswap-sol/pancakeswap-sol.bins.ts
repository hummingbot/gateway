import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { BinLiquidity } from '../../schemas/clmm-schema';
import { logger } from '../../services/logger';

import { getAmountsFromLiquidity } from './pancakeswap-sol.math';
import { getTickArrayAddress, getTickArrayStartIndexFromTick, tickToPrice } from './pancakeswap-sol.parser';

// TickArrayState layout (idl/clmm.json — identical to Raydium CLMM, which this
// program forks): discriminator(8) + pool_id(32) + start_tick_index(i32, 4) +
// ticks[60 x TickState] + initialized_tick_count(u8) + recent_epoch(u64) + padding.
// TickState: tick(i32, 4) + liquidity_net(i128, 16) + liquidity_gross(u128, 16) +
// fee_growth_outside_0_x64(16) + fee_growth_outside_1_x64(16) +
// reward_growths_outside_x64(3 x 16) + padding(13 x u32, 52) = 168 bytes.
const TICK_ARRAY_HEADER = 8 + 32 + 4;
const TICK_STATE_SIZE = 168;

function readI128LE(data: Buffer, offset: number): bigint {
  let value = 0n;
  for (let i = 0; i < 16; i++) {
    value += BigInt(data[offset + i]) << BigInt(8 * i);
  }
  if (value >= 1n << 127n) {
    value -= 1n << 128n;
  }
  return value;
}

function liquidityNetAt(arrays: Map<number, Buffer>, tickIndex: number, tickSpacing: number): bigint {
  const startIndex = getTickArrayStartIndexFromTick(tickIndex, tickSpacing);
  const data = arrays.get(startIndex);
  if (!data) return 0n;
  const slot = Math.floor((tickIndex - startIndex) / tickSpacing);
  const base = TICK_ARRAY_HEADER + slot * TICK_STATE_SIZE;
  if (base + TICK_STATE_SIZE > data.length) return 0n;
  // A zeroed (uninitialized) slot fails the tick check; its liquidity_net would
  // be 0 anyway, so either way the boundary contributes nothing.
  if (data.readInt32LE(base) !== tickIndex) return 0n;
  return readI128LE(data, base + 4);
}

/**
 * Per-bin liquidity distribution around the current tick, mirroring the
 * raydium/orca bin walk: propagate active liquidity outward across initialized
 * tick boundaries, then convert each bin's L into token amounts.
 */
export async function computeBinDistribution(args: {
  connection: Connection;
  poolAddress: string;
  tickSpacing: number;
  currentTick: number;
  currentPrice: number; // human units (quote per base)
  liquidity: bigint; // active liquidity at the current tick
  decimals0: number;
  decimals1: number;
  binCount: number;
}): Promise<BinLiquidity[]> {
  const { connection, poolAddress, tickSpacing, currentTick, currentPrice, liquidity, decimals0, decimals1, binCount } =
    args;
  if (binCount <= 0) return [];

  // Snap the bin grid so the current tick lands inside a bin.
  const halfBins = Math.floor(binCount / 2);
  const snapped = Math.floor(currentTick / tickSpacing) * tickSpacing;
  const firstBinStart = snapped - halfBins * tickSpacing;
  const boundaries: number[] = [];
  for (let i = 0; i <= binCount; i++) {
    boundaries.push(firstBinStart + i * tickSpacing);
  }

  // Fetch every tick array the boundaries touch in one RPC round-trip.
  const poolPubkey = new PublicKey(poolAddress);
  const startIndexes = [...new Set(boundaries.map((t) => getTickArrayStartIndexFromTick(t, tickSpacing)))];
  const arrays = new Map<number, Buffer>();
  try {
    const accounts = await connection.getMultipleAccountsInfo(
      startIndexes.map((s) => getTickArrayAddress(poolPubkey, s)),
    );
    accounts.forEach((account, i) => {
      if (account) arrays.set(startIndexes[i], account.data);
    });
  } catch (e) {
    logger.warn(`pancakeswap-sol bin fetch failed for ${poolAddress}: ${e}`);
    return [];
  }

  // Propagate L outward from the current bin across boundary liquidity_net.
  const curIdx = Math.floor((currentTick - firstBinStart) / tickSpacing);
  const binLs: bigint[] = new Array(binCount);
  binLs[curIdx] = liquidity;
  for (let i = curIdx + 1; i < binCount; i++) {
    binLs[i] = binLs[i - 1] + liquidityNetAt(arrays, boundaries[i], tickSpacing);
  }
  for (let i = curIdx - 1; i >= 0; i--) {
    binLs[i] = binLs[i + 1] - liquidityNetAt(arrays, boundaries[i + 1], tickSpacing);
  }

  const decimalDiff = decimals0 - decimals1;
  const bins: BinLiquidity[] = [];
  for (let i = 0; i < binCount; i++) {
    const tickStart = boundaries[i];
    const priceLower = tickToPrice(tickStart, decimalDiff);
    const priceUpper = tickToPrice(boundaries[i + 1], decimalDiff);
    let baseTokenAmount = 0;
    let quoteTokenAmount = 0;
    const L = binLs[i];
    if (L > 0n) {
      const amounts = getAmountsFromLiquidity(
        currentPrice,
        priceLower,
        priceUpper,
        new BN(L.toString()),
        decimals0,
        decimals1,
      );
      baseTokenAmount = amounts.amount0;
      quoteTokenAmount = amounts.amount1;
    }
    bins.push({ binId: tickStart, price: priceLower, baseTokenAmount, quoteTokenAmount });
  }
  return bins;
}

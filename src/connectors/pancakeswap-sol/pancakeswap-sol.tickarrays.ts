import { PublicKey } from '@solana/web3.js';

import { PANCAKESWAP_CLMM_PROGRAM_ID } from './pancakeswap-sol';

/**
 * Tick-array discovery for PancakeSwap Solana CLMM swaps (a Raydium CLMM fork).
 *
 * `swap_v2` needs, as remaining accounts, the pool's first INITIALIZED tick array in the swap
 * direction (the one holding the current tick if it is initialized, else the next initialized one
 * that way) followed by the next initialized arrays in that direction. Which arrays are initialized
 * is recorded in two bitmaps, both scanned here directly:
 *   - PoolState.tick_array_bitmap: 1024 bits for array indices k in [-512, 512), bit = k + 512
 *   - TickArrayBitmapExtension:    14 x 512 bits on each side, for k >= 512 and k < -512
 * where k = start_tick_index / (60 * tick_spacing).
 */

export const TICK_ARRAY_SIZE = 60;
export const MIN_TICK = -443636;
export const MAX_TICK = 443636;

const BITS_PER_BITMAP = 512;
const EXTENSION_BITMAPS_PER_SIDE = 14;
const EXTENSION_BITMAP_BYTES = BITS_PER_BITMAP / 8; // 64

// PoolState byte offset of tick_array_bitmap ([u64; 16]): discriminator 8 + fields through
// reward_infos (3 x 169-byte RewardInfo), per the packed layout in idl/clmm.json.
export const POOL_TICK_ARRAY_BITMAP_OFFSET = 904;
const POOL_TICK_ARRAY_BITMAP_BYTES = 128;

// TickArrayBitmapExtension: discriminator 8 + pool_id 32, then positive and negative
// [[u64; 8]; 14] bitmaps.
const EXTENSION_POSITIVE_OFFSET = 40;
const EXTENSION_SIDE_BYTES = EXTENSION_BITMAPS_PER_SIDE * EXTENSION_BITMAP_BYTES; // 896
const EXTENSION_NEGATIVE_OFFSET = EXTENSION_POSITIVE_OFFSET + EXTENSION_SIDE_BYTES;
const EXTENSION_ACCOUNT_SIZE = EXTENSION_NEGATIVE_OFFSET + EXTENSION_SIDE_BYTES;

export interface TickArrayBitmaps {
  /** PoolState.tick_array_bitmap, 128 bytes (little-endian 1024-bit number). */
  pool: Buffer;
  /** Extension positive bitmaps, 14 x 64 bytes. */
  positive: Buffer;
  /** Extension negative bitmaps, 14 x 64 bytes. */
  negative: Buffer;
}

export function getTickArrayBitmapExtensionAddress(poolAddress: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool_tick_array_bitmap_extension'), poolAddress.toBuffer()],
    PANCAKESWAP_CLMM_PROGRAM_ID,
  );
  return address;
}

export function decodeTickArrayBitmaps(poolData: Buffer, extensionData: Buffer): TickArrayBitmaps {
  if (poolData.length < POOL_TICK_ARRAY_BITMAP_OFFSET + POOL_TICK_ARRAY_BITMAP_BYTES) {
    throw new Error(`Pool account data too short for tick_array_bitmap: ${poolData.length} bytes`);
  }
  if (extensionData.length < EXTENSION_ACCOUNT_SIZE) {
    throw new Error(`Tick array bitmap extension data too short: ${extensionData.length} bytes`);
  }
  return {
    pool: poolData.subarray(
      POOL_TICK_ARRAY_BITMAP_OFFSET,
      POOL_TICK_ARRAY_BITMAP_OFFSET + POOL_TICK_ARRAY_BITMAP_BYTES,
    ),
    positive: extensionData.subarray(EXTENSION_POSITIVE_OFFSET, EXTENSION_NEGATIVE_OFFSET),
    negative: extensionData.subarray(EXTENSION_NEGATIVE_OFFSET, EXTENSION_ACCOUNT_SIZE),
  };
}

function testBit(buf: Buffer, bit: number): boolean {
  return ((buf[bit >> 3] >> (bit & 7)) & 1) === 1;
}

export function tickCount(tickSpacing: number): number {
  return TICK_ARRAY_SIZE * tickSpacing;
}

/** Whether the tick array with index k (start = k * 60 * tickSpacing) is initialized. */
function isArrayIndexInitialized(bitmaps: TickArrayBitmaps, k: number): boolean {
  if (k >= -BITS_PER_BITMAP && k < BITS_PER_BITMAP) {
    return testBit(bitmaps.pool, k + BITS_PER_BITMAP);
  }
  if (k >= BITS_PER_BITMAP) {
    const j = k - BITS_PER_BITMAP;
    const bitmap = Math.floor(j / BITS_PER_BITMAP);
    if (bitmap >= EXTENSION_BITMAPS_PER_SIDE) throw new Error(`Tick array index ${k} beyond bitmap extension`);
    return testBit(bitmaps.positive, bitmap * BITS_PER_BITMAP + (j % BITS_PER_BITMAP));
  }
  // k < -512: j in [-7168, -1]; bitmap 0 holds k in [-1024, -513], bit = k mod 512.
  const j = k + BITS_PER_BITMAP;
  const bitmap = Math.floor((-j - 1) / BITS_PER_BITMAP);
  if (bitmap >= EXTENSION_BITMAPS_PER_SIDE) throw new Error(`Tick array index ${k} beyond bitmap extension`);
  const bit = ((k % BITS_PER_BITMAP) + BITS_PER_BITMAP) % BITS_PER_BITMAP;
  return testBit(bitmaps.negative, bitmap * BITS_PER_BITMAP + bit);
}

export function isTickArrayInitialized(bitmaps: TickArrayBitmaps, startIndex: number, tickSpacing: number): boolean {
  if (startIndex % tickCount(tickSpacing) !== 0) {
    throw new Error(`${startIndex} is not a tick array start index for tick spacing ${tickSpacing}`);
  }
  return isArrayIndexInitialized(bitmaps, startIndex / tickCount(tickSpacing));
}

/**
 * Start indices of the tick arrays a swap walks, in the order `swap_v2` consumes them: the array
 * holding the current tick if initialized, else the first initialized one in the swap direction,
 * then the following initialized ones that way. `zeroForOne` (input is token 0) moves the price
 * down, toward lower start indices. Throws if no array is initialized in that direction.
 */
export function getSwapTickArrayStartIndices(
  bitmaps: TickArrayBitmaps,
  tickCurrent: number,
  tickSpacing: number,
  zeroForOne: boolean,
  count: number = 3,
): number[] {
  const ticks = tickCount(tickSpacing);
  const minK = Math.floor(MIN_TICK / ticks);
  const maxK = Math.floor(MAX_TICK / ticks);
  const step = zeroForOne ? -1 : 1;

  const startIndices: number[] = [];
  for (let k = Math.floor(tickCurrent / ticks); k >= minK && k <= maxK && startIndices.length < count; k += step) {
    if (isArrayIndexInitialized(bitmaps, k)) startIndices.push(k * ticks);
  }

  if (startIndices.length === 0) {
    throw new Error(
      `No initialized tick array ${zeroForOne ? 'below' : 'above'} tick ${tickCurrent}: ` +
        `the pool has no liquidity for a ${zeroForOne ? 'token0 -> token1' : 'token1 -> token0'} swap`,
    );
  }
  return startIndices;
}

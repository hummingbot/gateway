/**
 * Uniswap V4 read layer.
 *
 * A V4 pool is not a contract. Every pool is an entry in the singleton PoolManager,
 * which means none of the V3 route's moves are available: there is no pool address to
 * call, no `token0()` to ask, and no `balanceOf(pool)` to read. Three consequences
 * shape this module.
 *
 * **Identity is a hash, so it is recovered rather than parsed.** A pool is keyed by
 * `poolId = keccak256(abi.encode(PoolKey))`, and keccak256 does not invert. The
 * PositionManager, however, records the key of every pool it has minted into, indexed
 * by the first 25 bytes of that id (`poolKeys`). One call recovers the key, and
 * re-deriving the id from what came back proves it: neither an unpopulated entry nor a
 * 25-byte collision can produce a key that hashes to the requested 32-byte id. That
 * check is why this is safe despite the truncation.
 *
 * The alternative — scanning PoolManager's `Initialize` event for the id — was
 * rejected after measuring it. It works on some RPCs (Robinhood's public node answers
 * a full-range filtered scan in ~350ms) and not others (a QuickNode endpoint rejects
 * the same request with HTTP 413), so it cannot be the primary path.
 *
 * **State is read by storage slot, in batches.** Every per-pool word lives in
 * PoolManager storage, and `extsload(bytes32[])` returns an arbitrary set of slots in
 * a single eth_call. That is what makes a full-range tick scan affordable: the 1,388
 * bitmap words of a tickSpacing-5 pool cost a handful of batched calls instead of
 * 1,388 sequential ones — measured at ~1.1s against ~5s on a good run and ~68s on a
 * throttled one. StateView exposes the same values one getter at a time and cannot
 * batch, so it serves only as the cross-check in the tests.
 *
 * **Reserves are reconstructed, not read.** The singleton holds every pool's tokens
 * commingled, so no per-pool balance exists to report. The amounts here are integrated
 * from the pool's own liquidity profile, which differs from the V3 route's
 * `balanceOf(pool)` in one respect worth knowing: uncollected LP fees and accrued
 * protocol fees sit in a V3 pool's balance but are not backed by liquidity, so the V4
 * figure is the liquidity-backed reserve and reads slightly lower. Checked against a
 * V3 pool where both numbers are available, the profile came to 0.9935x and 0.9966x of
 * the token balances — the fee wedge, and nothing else.
 */

import { Contract } from '@ethersproject/contracts';
import { BigNumber, utils } from 'ethers';

import { Ethereum, TokenInfo } from '../../chains/ethereum/ethereum';
import { logger } from '../../services/logger';

import {
  getUniswapV4PoolManagerAddress,
  getUniswapV4PositionManagerAddress,
  IPoolManagerABI,
  IV4PositionManagerABI,
} from './uniswap.contracts';

/** Slot of the `pools` mapping in PoolManager, and the offsets within `Pool.State`. */
const POOLS_SLOT = 6;
const LIQUIDITY_OFFSET = 3;
const TICKS_OFFSET = 4;
const TICK_BITMAP_OFFSET = 5;

/** Tick bounds are the same as V3's. */
const MIN_TICK = -887272;
const MAX_TICK = 887272;

/**
 * Slots per `extsload` call. One call can carry every slot, but splitting into a few
 * parallel calls is consistently faster than one large one (1,388 words: ~1.1s across
 * 7 calls, ~2.9s in a single call) because the node executes them concurrently.
 */
const EXTSLOAD_CHUNK = 200;

export const V4_NATIVE_CURRENCY = '0x0000000000000000000000000000000000000000';

export interface V4PoolKey {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
}

export interface V4PoolState {
  sqrtPriceX96: BigNumber;
  tick: number;
  /** Packed pair of 12-bit fees taken by the protocol, in hundredths of a bip. */
  protocolFee: number;
  /** The LP fee currently in force, in hundredths of a bip. */
  lpFee: number;
  /** Liquidity active at `tick`. */
  liquidity: bigint;
}

/** An initialized tick and the liquidity delta crossing it upward applies. */
export interface V4TickDelta {
  tick: number;
  liquidityNet: bigint;
}

/** A V4 pool id is a 32-byte hash; a V3 pool address is 20 bytes. */
export function isV4PoolId(poolAddress: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(poolAddress);
}

/**
 * PoolKeys are immutable — the id is a hash of the key — so a resolved key is cached
 * for the life of the process. Keyed by network as well as id because the same id can
 * exist on more than one chain.
 */
const poolKeyCache = new Map<string, V4PoolKey>();

function poolStateSlot(poolId: string): BigNumber {
  return BigNumber.from(utils.keccak256(utils.solidityPack(['bytes32', 'uint256'], [poolId, POOLS_SLOT])));
}

function mappingSlot(mappingBase: BigNumber, key: number): string {
  return utils.keccak256(utils.solidityPack(['int256', 'uint256'], [key, mappingBase]));
}

function asSlot(value: BigNumber): string {
  return utils.hexZeroPad(value.toHexString(), 32);
}

/** Two's-complement read of the low `bits` of `value`. */
function toSigned(value: BigNumber, bits: number): BigNumber {
  const masked = value.mask(bits);
  const signBit = BigNumber.from(1).shl(bits - 1);
  return masked.gte(signBit) ? masked.sub(BigNumber.from(1).shl(bits)) : masked;
}

async function poolManagerContract(network: string): Promise<Contract> {
  const ethereum = await Ethereum.getInstance(network);
  return new Contract(getUniswapV4PoolManagerAddress(network), IPoolManagerABI, ethereum.provider);
}

/** Read many PoolManager storage slots, batched across a few parallel eth_calls. */
async function extsload(network: string, slots: string[]): Promise<string[]> {
  const manager = await poolManagerContract(network);
  const chunks: string[][] = [];
  for (let i = 0; i < slots.length; i += EXTSLOAD_CHUNK) {
    chunks.push(slots.slice(i, i + EXTSLOAD_CHUNK));
  }
  const results = await Promise.all(chunks.map((chunk) => manager['extsload(bytes32[])'](chunk)));
  return results.flat();
}

/** Re-derive a pool id from its key, the same way PoolManager does. */
export function deriveV4PoolId(key: V4PoolKey): string {
  return utils.keccak256(
    utils.defaultAbiCoder.encode(
      ['address', 'address', 'uint24', 'int24', 'address'],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  );
}

/**
 * Recover a pool's PoolKey from its id via `PositionManager.poolKeys`, and verify the
 * recovery by re-deriving the id.
 *
 * The mapping is keyed by the first 25 bytes of the id, so the returned key is only a
 * candidate until it hashes back to the full id. Failing that check means the pool has
 * no position minted through the canonical PositionManager, which is also the only
 * circumstance under which nothing here can describe it — so it is reported as such
 * rather than guessed at.
 */
export async function resolveV4PoolKey(network: string, poolId: string): Promise<V4PoolKey> {
  const cacheKey = `${network}:${poolId.toLowerCase()}`;
  const cached = poolKeyCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const ethereum = await Ethereum.getInstance(network);
  const positionManager = new Contract(
    getUniswapV4PositionManagerAddress(network),
    IV4PositionManagerABI,
    ethereum.provider,
  );

  const truncatedId = utils.hexDataSlice(poolId, 0, 25);
  const raw = await positionManager.poolKeys(truncatedId);
  const key: V4PoolKey = {
    currency0: raw.currency0,
    currency1: raw.currency1,
    fee: Number(raw.fee),
    tickSpacing: Number(raw.tickSpacing),
    hooks: raw.hooks,
  };

  const derived = deriveV4PoolId(key);
  if (derived.toLowerCase() !== poolId.toLowerCase()) {
    throw new Error(
      `Could not resolve the PoolKey for V4 pool ${poolId} on ${network}. ` +
        `PositionManager.poolKeys(${truncatedId}) returned a key that hashes to ${derived}, not the ` +
        `requested id. The PositionManager only records pools it has minted a position into, so this ` +
        `pool either has no position held through it or does not exist on this network.`,
    );
  }

  poolKeyCache.set(cacheKey, key);
  return key;
}

/** Read slot0 and active liquidity for a pool. */
export async function getV4PoolState(network: string, poolId: string): Promise<V4PoolState> {
  const stateSlot = poolStateSlot(poolId);
  const [slot0Word, liquidityWord] = await extsload(network, [
    asSlot(stateSlot),
    asSlot(stateSlot.add(LIQUIDITY_OFFSET)),
  ]);

  // slot0 packs, from the low bit: sqrtPriceX96 (160) | tick (24) | protocolFee (24) | lpFee (24).
  const packed = BigNumber.from(slot0Word);
  const state: V4PoolState = {
    sqrtPriceX96: packed.mask(160),
    tick: toSigned(packed.shr(160), 24).toNumber(),
    protocolFee: packed.shr(184).mask(24).toNumber(),
    lpFee: packed.shr(208).mask(24).toNumber(),
    liquidity: BigInt(BigNumber.from(liquidityWord).mask(128).toString()),
  };

  if (state.sqrtPriceX96.isZero()) {
    throw new Error(
      `V4 pool ${poolId} on ${network} has no price in PoolManager storage, so it has never been ` +
        `initialized. Check the pool id and the network.`,
    );
  }
  return state;
}

/**
 * Every initialized tick in the pool, with its liquidityNet, in ascending order.
 *
 * Two batched reads: the tick bitmap over the full tick range, then the packed tick
 * word for each bit that is set. Scanning the whole range rather than a window is what
 * makes the reserve total exact — a position sitting entirely away from the current
 * price is real inventory, and a windowed scan would silently omit it.
 */
export async function getV4InitializedTicks(
  network: string,
  poolId: string,
  tickSpacing: number,
): Promise<V4TickDelta[]> {
  const stateSlot = poolStateSlot(poolId);
  const bitmapBase = stateSlot.add(TICK_BITMAP_OFFSET);

  const minWord = Math.floor(Math.floor(MIN_TICK / tickSpacing) / 256);
  const maxWord = Math.floor(Math.floor(MAX_TICK / tickSpacing) / 256);
  const words: number[] = [];
  for (let word = minWord; word <= maxWord; word++) {
    words.push(word);
  }

  const bitmaps = await extsload(
    network,
    words.map((word) => mappingSlot(bitmapBase, word)),
  );

  const ticks: number[] = [];
  bitmaps.forEach((bitmap, index) => {
    let bits = BigInt(BigNumber.from(bitmap).toString());
    if (bits === 0n) {
      return;
    }
    for (let bit = 0; bit < 256; bit++) {
      if ((bits >> BigInt(bit)) & 1n) {
        ticks.push((words[index] * 256 + bit) * tickSpacing);
      }
    }
    bits = 0n;
  });
  ticks.sort((a, b) => a - b);

  const ticksBase = stateSlot.add(TICKS_OFFSET);
  const tickWords = await extsload(
    network,
    ticks.map((tick) => mappingSlot(ticksBase, tick)),
  );

  // The first tick word packs liquidityNet (int128, high) over liquidityGross (uint128, low).
  return ticks.map((tick, index) => ({
    tick,
    liquidityNet: BigInt(toSigned(BigNumber.from(tickWords[index]).shr(128), 128).toString()),
  }));
}

/**
 * Liquidity active in each span between consecutive initialized ticks.
 *
 * Liquidity is zero below the lowest initialized tick, and each tick crossed upward
 * adds its liquidityNet. Returned as boundaries plus one liquidity per span so the
 * amount math can be shared with the V3 bin walk.
 */
export function v4LiquidityProfile(ticks: V4TickDelta[]): { boundaries: number[]; liquidities: bigint[] } {
  const boundaries = ticks.map((entry) => entry.tick);
  const liquidities: bigint[] = [];
  let liquidity = 0n;
  for (let i = 0; i < ticks.length - 1; i++) {
    liquidity += ticks[i].liquidityNet;
    liquidities.push(liquidity);
  }
  return { boundaries, liquidities };
}

/** Liquidity active at `tick` given the profile, by binary search over the boundaries. */
export function v4LiquidityAt(profile: { boundaries: number[]; liquidities: bigint[] }, tick: number): bigint {
  const { boundaries, liquidities } = profile;
  if (boundaries.length === 0 || tick < boundaries[0] || tick >= boundaries[boundaries.length - 1]) {
    return 0n;
  }
  let lo = 0;
  let hi = liquidities.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (boundaries[mid] <= tick) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return liquidities[lo];
}

/**
 * Resolve a V4 currency to token metadata, including native ETH.
 *
 * V4 addresses native ETH as the zero address and holds it unwrapped, so a V4 pool can
 * be ETH/X where the V3 equivalent would be WETH/X. The zero address has no ERC-20 to
 * ask, so the chain's own native symbol answers for it.
 */
export async function resolveV4Currency(network: string, currency: string): Promise<TokenInfo> {
  const ethereum = await Ethereum.getInstance(network);

  if (currency === V4_NATIVE_CURRENCY) {
    return {
      address: V4_NATIVE_CURRENCY,
      chainId: ethereum.chainId,
      // Every EVM native currency carries 18 decimals; there is no contract to read.
      decimals: 18,
      name: ethereum.nativeTokenSymbol,
      symbol: ethereum.nativeTokenSymbol,
    };
  }

  const token = await ethereum.getToken(currency);
  if (!token) {
    throw new Error(`No token metadata for V4 currency ${currency} on ${network}: it is not an ERC-20.`);
  }
  return token;
}

/**
 * Assert that a profile reproduces the pool's own active liquidity.
 *
 * Everything above reads raw storage at slots derived from an assumed `Pool.State`
 * layout. This is the check that the assumption still holds: liquidity integrated from
 * the tick bitmap must equal the `liquidity` word PoolManager maintains independently.
 * A layout change in v4-core would break both, and this catches it loudly instead of
 * returning a plausible wrong number.
 */
export function assertV4ProfileMatchesState(
  poolId: string,
  profile: { boundaries: number[]; liquidities: bigint[] },
  state: V4PoolState,
): void {
  const fromProfile = v4LiquidityAt(profile, state.tick);
  if (fromProfile !== state.liquidity) {
    throw new Error(
      `V4 pool ${poolId} liquidity profile disagrees with pool state: the tick bitmap integrates to ` +
        `${fromProfile} at tick ${state.tick} but PoolManager reports ${state.liquidity}. The assumed ` +
        `Pool.State storage layout in uniswap.v4.ts is likely stale.`,
    );
  }
  logger.debug(`V4 pool ${poolId}: profile matches active liquidity ${state.liquidity} at tick ${state.tick}`);
}

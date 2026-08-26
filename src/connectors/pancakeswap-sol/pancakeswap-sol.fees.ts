import { BorshCoder } from '@coral-xyz/anchor';
import { AccountInfo, PublicKey } from '@solana/web3.js';

import { getTickArrayAddress, getTickArrayStartIndexFromTick } from './pancakeswap-sol.parser';

const clmmIdl = require('./idl/clmm.json');

/**
 * Uncollected fees for a CLMM position, from the same numbers the program uses.
 *
 * `position_info` used to answer 0 for both sides unconditionally, with a TODO saying a
 * wrong number would be worse than no number. But zero *is* a number and it was being
 * stored: nothing downstream could tell "this connector does not compute fees" from
 * "this position earned nothing". A position that sat in range while the pool traded
 * through it — composition moving from 0.009789 SOL / 0.910 USDC to 0.008894 / 0.988 in
 * five minutes, which only happens if swaps crossed it — reported 0 throughout, while
 * the collect-fees route harvested a real amount from the same position minutes later.
 *
 * The arithmetic is Uniswap v3's, which this program (a Raydium CLMM fork) implements:
 * a tick records the fee growth accumulated on the *far* side of it, so the growth
 * inside a range is the global growth less the part below the lower tick and the part
 * above the upper tick, with which side of each tick is "outside" depending on where the
 * price is now. Multiply the growth accrued since the position last checkpointed by its
 * liquidity, and add whatever was already owed at that checkpoint.
 *
 * Everything is unsigned 128-bit and the program subtracts with wrapping arithmetic
 * deliberately: fee growth accumulators are allowed to overflow, and only the difference
 * between two readings is meaningful. Subtracting without wrapping produces an enormous
 * positive number the moment an accumulator laps, which is exactly the "plausible but
 * wrong" answer the old TODO was afraid of.
 */

const U128 = 1n << 128n;
const Q64 = 1n << 64n;

/** u128 subtraction that wraps, as the on-chain math does. */
export function wrappingSub(a: bigint, b: bigint): bigint {
  return (((a - b) % U128) + U128) % U128;
}

export interface TickFeeGrowth {
  /** The tick's index. */
  tick: number;
  /** fee_growth_outside_0_x64 as stored. */
  outside0: bigint;
  /** fee_growth_outside_1_x64 as stored. */
  outside1: bigint;
}

/**
 * Fee growth accumulated inside a tick range, per unit of liquidity, in X64.
 *
 * `tickCurrent` decides what "outside" means for each boundary: below the lower tick the
 * stored value is the growth *below* it, at or above it the growth is everything else.
 */
export function feeGrowthInside(
  tickCurrent: number,
  lower: TickFeeGrowth,
  upper: TickFeeGrowth,
  feeGrowthGlobal0: bigint,
  feeGrowthGlobal1: bigint,
): { inside0: bigint; inside1: bigint } {
  const below0 = tickCurrent >= lower.tick ? lower.outside0 : wrappingSub(feeGrowthGlobal0, lower.outside0);
  const below1 = tickCurrent >= lower.tick ? lower.outside1 : wrappingSub(feeGrowthGlobal1, lower.outside1);
  const above0 = tickCurrent < upper.tick ? upper.outside0 : wrappingSub(feeGrowthGlobal0, upper.outside0);
  const above1 = tickCurrent < upper.tick ? upper.outside1 : wrappingSub(feeGrowthGlobal1, upper.outside1);

  return {
    inside0: wrappingSub(wrappingSub(feeGrowthGlobal0, below0), above0),
    inside1: wrappingSub(wrappingSub(feeGrowthGlobal1, below1), above1),
  };
}

/**
 * What a collect would pay out right now, in the token's smallest units.
 *
 * `owed` is what the position had banked at its last checkpoint; the rest is what has
 * accrued since. A position with no liquidity accrues nothing and is owed whatever it
 * banked, which is the case a just-emptied position is in.
 */
export function pendingFee(
  owed: bigint,
  liquidity: bigint,
  feeGrowthInsideNow: bigint,
  feeGrowthInsideLast: bigint,
): bigint {
  const accrued = (wrappingSub(feeGrowthInsideNow, feeGrowthInsideLast) * liquidity) / Q64;
  return owed + accrued;
}

/**
 * Read the two tick states a position's range is bounded by, and compute what a collect
 * would pay out right now.
 *
 * The tick arrays are decoded with the program's own IDL rather than by counting bytes:
 * a `TickState` is 168 bytes of mixed i128/u128/arrays sixty times over inside a
 * `TickArrayState`, and a single wrong offset here would produce a confident, plausible,
 * wrong fee figure — the exact failure the old hardcoded zero was chosen to avoid.
 *
 * Throws rather than guessing when a tick array is missing. A position's own tick arrays
 * hold its liquidity, so their absence means something is wrong that a fabricated zero
 * would hide.
 */
export async function readPendingFees(
  connection: { getMultipleAccountsInfo: (keys: PublicKey[]) => Promise<(AccountInfo<Buffer> | null)[]> },
  poolId: PublicKey,
  tickSpacing: number,
  tickCurrent: number,
  feeGrowthGlobal0: bigint,
  feeGrowthGlobal1: bigint,
  position: {
    tickLowerIndex: number;
    tickUpperIndex: number;
    liquidity: bigint;
    feeGrowthInside0Last: bigint;
    feeGrowthInside1Last: bigint;
    tokenFeesOwed0: bigint;
    tokenFeesOwed1: bigint;
  },
): Promise<{ fee0Raw: bigint; fee1Raw: bigint }> {
  const lowerStart = getTickArrayStartIndexFromTick(position.tickLowerIndex, tickSpacing);
  const upperStart = getTickArrayStartIndexFromTick(position.tickUpperIndex, tickSpacing);
  const [lowerArray, upperArray] = await connection.getMultipleAccountsInfo([
    getTickArrayAddress(poolId, lowerStart),
    getTickArrayAddress(poolId, upperStart),
  ]);

  const readTick = (account: AccountInfo<Buffer> | null, tick: number, start: number): TickFeeGrowth => {
    if (!account) {
      throw new Error(
        `Tick array at ${start} for pool ${poolId.toBase58()} not found: a position's own tick arrays ` +
          'hold its liquidity, so uncollected fees cannot be computed for it.',
      );
    }
    const decoded: any = new BorshCoder(clmmIdl).accounts.decode('TickArrayState', account.data);
    const state = decoded.ticks[(tick - start) / tickSpacing];
    return {
      tick,
      outside0: BigInt(state.fee_growth_outside_0_x64.toString()),
      outside1: BigInt(state.fee_growth_outside_1_x64.toString()),
    };
  };

  const { inside0, inside1 } = feeGrowthInside(
    tickCurrent,
    readTick(lowerArray, position.tickLowerIndex, lowerStart),
    readTick(upperArray, position.tickUpperIndex, upperStart),
    feeGrowthGlobal0,
    feeGrowthGlobal1,
  );

  return {
    fee0Raw: pendingFee(position.tokenFeesOwed0, position.liquidity, inside0, position.feeGrowthInside0Last),
    fee1Raw: pendingFee(position.tokenFeesOwed1, position.liquidity, inside1, position.feeGrowthInside1Last),
  };
}

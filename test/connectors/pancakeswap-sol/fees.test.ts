import { feeGrowthInside, pendingFee, wrappingSub } from '../../../src/connectors/pancakeswap-sol/pancakeswap-sol.fees';

const Q64 = 1n << 64n;
const U128 = 1n << 128n;
const perUnit = (n: number) => BigInt(n) * Q64; // fee growth of n tokens per unit of liquidity

describe('wrappingSub', () => {
  it('subtracts normally when it can', () => {
    expect(wrappingSub(10n, 4n)).toBe(6n);
  });

  it('wraps rather than going negative', () => {
    // Fee-growth accumulators are allowed to overflow, and only the difference between
    // two readings means anything. A plain subtraction here would report a position's
    // pending fees as roughly 3.4e38 the first time an accumulator lapped.
    expect(wrappingSub(4n, 10n)).toBe(U128 - 6n);
  });
});

describe('feeGrowthInside', () => {
  const lower = { tick: -100, outside0: perUnit(1), outside1: perUnit(2) };
  const upper = { tick: 100, outside0: perUnit(3), outside1: perUnit(4) };
  const global0 = perUnit(10);
  const global1 = perUnit(20);

  it('takes both boundaries off the global growth when the price is in range', () => {
    const { inside0, inside1 } = feeGrowthInside(0, lower, upper, global0, global1);

    expect(inside0).toBe(perUnit(10 - 1 - 3));
    expect(inside1).toBe(perUnit(20 - 2 - 4));
  });

  it('flips the lower boundary when the price is below the range', () => {
    // Below the lower tick, its stored value is the growth on the far side, so the part
    // below the range is everything else.
    const { inside0 } = feeGrowthInside(-200, lower, upper, global0, global1);

    // 10 - (10 - 1) - 3 is negative, and that is normal: an "inside" reading is only
    // meaningful as the difference between two of them, so the program lets it wrap.
    expect(inside0).toBe(wrappingSub(wrappingSub(perUnit(10), perUnit(10) - perUnit(1)), perUnit(3)));
  });

  it('flips the upper boundary when the price is above the range', () => {
    const { inside0 } = feeGrowthInside(200, lower, upper, global0, global1);

    expect(inside0).toBe(perUnit(10) - perUnit(1) - (perUnit(10) - perUnit(3)));
  });

  it('treats the lower tick itself as in range', () => {
    // The program's comparison is `tick_current >= tick_lower`, and a position at
    // exactly its lower tick is in range.
    expect(feeGrowthInside(-100, lower, upper, global0, global1).inside0).toBe(
      feeGrowthInside(0, lower, upper, global0, global1).inside0,
    );
  });

  it('treats the upper tick itself as out of range', () => {
    // `tick_current < tick_upper`: a range is open at the top.
    expect(feeGrowthInside(100, lower, upper, global0, global1).inside0).toBe(
      feeGrowthInside(200, lower, upper, global0, global1).inside0,
    );
  });
});

describe('pendingFee', () => {
  it('is what was banked when nothing has accrued since', () => {
    expect(pendingFee(1234n, 5_000n, perUnit(7), perUnit(7))).toBe(1234n);
  });

  it('adds the growth since the checkpoint, scaled by liquidity', () => {
    // 2 tokens per unit of liquidity, 5000 units, plus 1234 already owed.
    expect(pendingFee(1234n, 5_000n, perUnit(9), perUnit(7))).toBe(1234n + 10_000n);
  });

  it('accrues nothing for a position holding no liquidity', () => {
    // A just-emptied position is owed exactly what it banked.
    expect(pendingFee(1234n, 0n, perUnit(9), perUnit(7))).toBe(1234n);
  });

  it('stays sane across an accumulator wrap', () => {
    // The checkpoint was taken just below the u128 ceiling and the accumulator has
    // since lapped. The real growth is small; unwrapped arithmetic would report ~3.4e38.
    const last = U128 - perUnit(1);
    const now = perUnit(1);

    expect(pendingFee(0n, 1n, now, last)).toBe(2n);
  });
});

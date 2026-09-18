import { Contract } from '@ethersproject/contracts';
import { SqrtPriceMath, TickMath } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';

import { computeV3BinDistribution, V3SqrtPriceMath, V3TickMath } from '../../src/connectors/clmm-v3-utils';

const tickMath: V3TickMath = {
  getSqrtRatioAtTick: (tick) => BigInt(TickMath.getSqrtRatioAtTick(tick).toString()),
};
const sqrtPriceMath: V3SqrtPriceMath = {
  getAmount0Delta: (a, b, l, r) =>
    BigInt(
      SqrtPriceMath.getAmount0Delta(
        JSBI.BigInt(a.toString()),
        JSBI.BigInt(b.toString()),
        JSBI.BigInt(l.toString()),
        r,
      ).toString(),
    ),
  getAmount1Delta: (a, b, l, r) =>
    BigInt(
      SqrtPriceMath.getAmount1Delta(
        JSBI.BigInt(a.toString()),
        JSBI.BigInt(b.toString()),
        JSBI.BigInt(l.toString()),
        r,
      ).toString(),
    ),
};

const TICK_SPACING = 10;
const CURRENT_TICK = 0;

/**
 * A pool whose only liquidity change inside the window is at tick 20: everything below it
 * carries the active liquidity, everything at or above it carries half. A profile that
 * misses that tick reads perfectly flat, which is the shape the old error handling
 * produced from failed reads.
 */
const STEP_TICK = 20;
const ACTIVE_L = 1_000_000n;
const DROP = -500_000n;

function makePool(opts: { failTicks?: Set<number>; failTimes?: number } = {}) {
  const failTimes = opts.failTimes ?? Infinity;
  const seen = { ticks: [] as number[], bitmapWords: [] as number[] };
  let failures = 0;

  const contract = {
    tickBitmap: jest.fn(async (word: number) => {
      seen.bitmapWords.push(word);
      let bits = 0n;
      // Only STEP_TICK is initialized.
      const compressed = STEP_TICK / TICK_SPACING;
      if (Math.floor(compressed / 256) === word) bits |= 1n << BigInt(compressed % 256);
      return bits;
    }),
    ticks: jest.fn(async (tick: number) => {
      if (opts.failTicks?.has(tick) && failures < failTimes) {
        failures += 1;
        // What ethers hands back for a rate-limited eth_call: no status, no body.
        throw Object.assign(new Error('missing revert data in call exception'), {
          code: 'CALL_EXCEPTION',
          error: { reason: 'failed response', code: 'SERVER_ERROR' },
        });
      }
      seen.ticks.push(tick);
      return { liquidityNet: tick === STEP_TICK ? DROP.toString() : '0' };
    }),
  };
  return { contract: contract as unknown as Contract, seen, calls: contract };
}

const run = (poolContract: Contract, binCount = 8) =>
  computeV3BinDistribution({
    poolContract,
    tickSpacing: TICK_SPACING,
    currentTick: CURRENT_TICK,
    currentSqrtPriceX96: tickMath.getSqrtRatioAtTick(CURRENT_TICK),
    activeLiquidity: ACTIVE_L,
    decimals0: 18,
    decimals1: 18,
    isBaseToken0: true,
    binCount,
    tickMath,
    sqrtPriceMath,
  });

describe('computeV3BinDistribution', () => {
  it('reads ticks() only where the bitmap reports liquidity', async () => {
    const { contract, seen, calls } = makePool();
    await run(contract, 8);
    // Nine boundaries in the window, one of them initialized.
    expect(seen.ticks).toEqual([STEP_TICK]);
    expect(calls.ticks).toHaveBeenCalledTimes(1);
    expect(calls.tickBitmap).toHaveBeenCalled();
  });

  it('reproduces the liquidity step rather than a flat profile', async () => {
    const { contract } = makePool();
    const bins = await run(contract, 8);
    const below = bins.filter((b) => b.binId < STEP_TICK && b.binId >= CURRENT_TICK);
    const above = bins.filter((b) => b.binId >= STEP_TICK);
    // Above the step the pool holds half the liquidity, so an equal-width bin there holds
    // materially less token0 than one just below it.
    const lastBelow = below[below.length - 1];
    const firstAbove = above[0];
    expect(lastBelow.baseTokenAmount).toBeGreaterThan(0);
    expect(firstAbove.baseTokenAmount).toBeGreaterThan(0);
    expect(firstAbove.baseTokenAmount / lastBelow.baseTokenAmount).toBeLessThan(0.6);
  });

  it('propagates a read failure instead of reporting it as zero liquidity', async () => {
    // The regression: treating this rejection as liquidityNet 0 erases the step and
    // returns a flat, plausible, wrong profile.
    const { contract } = makePool({ failTicks: new Set([STEP_TICK]) });
    await expect(run(contract, 8)).rejects.toThrow('missing revert data in call exception');
  });

  it('retries a transient read failure and still sees the step', async () => {
    const { contract } = makePool({ failTicks: new Set([STEP_TICK]), failTimes: 1 });
    const bins = await run(contract, 8);
    const lastBelow = bins.filter((b) => b.binId < STEP_TICK && b.binId >= CURRENT_TICK).pop()!;
    const firstAbove = bins.find((b) => b.binId >= STEP_TICK)!;
    expect(firstAbove.baseTokenAmount / lastBelow.baseTokenAmount).toBeLessThan(0.6);
  });

  it('returns no bins when none are requested', async () => {
    const { contract, calls } = makePool();
    await expect(run(contract, 0)).resolves.toEqual([]);
    expect(calls.tickBitmap).not.toHaveBeenCalled();
  });
});

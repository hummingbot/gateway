import { BigNumber } from 'ethers';

import { binsFromLiquidityProfile } from '../../../src/connectors/clmm-v3-utils';
import { uniswapSqrtPriceMath, uniswapTickMath } from '../../../src/connectors/uniswap/uniswap.utils';
import {
  assertV4ProfileMatchesState,
  deriveV4PoolId,
  isV4PoolId,
  V4PoolState,
  v4LiquidityAt,
  v4LiquidityProfile,
} from '../../../src/connectors/uniswap/uniswap.v4';

const ticks = [
  { tick: -100, liquidityNet: 1000n },
  { tick: 0, liquidityNet: 500n },
  { tick: 100, liquidityNet: -1500n },
];

describe('isV4PoolId', () => {
  it('accepts a 32-byte id and rejects a 20-byte pool address', () => {
    expect(isV4PoolId('0x' + 'ab'.repeat(32))).toBe(true);
    expect(isV4PoolId('0x' + 'ab'.repeat(20))).toBe(false);
    expect(isV4PoolId('')).toBe(false);
  });
});

describe('deriveV4PoolId', () => {
  it('is deterministic and a 32-byte hash', () => {
    const key = {
      currency0: '0x0000000000000000000000000000000000000000',
      currency1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      fee: 500,
      tickSpacing: 10,
      hooks: '0x0000000000000000000000000000000000000000',
    };
    const id = deriveV4PoolId(key);
    expect(isV4PoolId(id)).toBe(true);
    expect(deriveV4PoolId(key)).toBe(id);
    expect(deriveV4PoolId({ ...key, fee: 3000 })).not.toBe(id);
  });
});

describe('v4LiquidityProfile / v4LiquidityAt', () => {
  const profile = v4LiquidityProfile(ticks);

  it('accumulates liquidityNet across initialized ticks', () => {
    expect(profile.boundaries).toEqual([-100, 0, 100]);
    expect(profile.liquidities).toEqual([1000n, 1500n]);
  });

  it('returns the liquidity of the span containing the tick', () => {
    expect(v4LiquidityAt(profile, -100)).toBe(1000n);
    expect(v4LiquidityAt(profile, -1)).toBe(1000n);
    expect(v4LiquidityAt(profile, 0)).toBe(1500n);
    expect(v4LiquidityAt(profile, 99)).toBe(1500n);
  });

  it('returns zero outside the profile', () => {
    expect(v4LiquidityAt(profile, -101)).toBe(0n);
    expect(v4LiquidityAt(profile, 100)).toBe(0n);
    expect(v4LiquidityAt({ boundaries: [], liquidities: [] }, 0)).toBe(0n);
  });
});

describe('assertV4ProfileMatchesState', () => {
  const profile = v4LiquidityProfile(ticks);
  const state = (liquidity: bigint): V4PoolState => ({
    sqrtPriceX96: BigNumber.from(2).pow(96),
    tick: 50,
    protocolFee: 0,
    lpFee: 500,
    liquidity,
  });

  it('passes when the profile reproduces the active liquidity', () => {
    expect(() => assertV4ProfileMatchesState('0xid', profile, state(1500n))).not.toThrow();
  });

  it('throws when the profile disagrees with pool state', () => {
    expect(() => assertV4ProfileMatchesState('0xid', profile, state(1499n))).toThrow(/disagrees with pool state/);
  });
});

describe('binsFromLiquidityProfile', () => {
  const args = {
    decimals0: 18,
    decimals1: 18,
    isBaseToken0: true,
    tickMath: uniswapTickMath,
    sqrtPriceMath: uniswapSqrtPriceMath,
  };
  const sqrtPriceX96 = BigInt(uniswapTickMath.getSqrtRatioAtTick(0).toString());

  it('puts token1 below the current tick, token0 above, and both in the active bin', () => {
    const bins = binsFromLiquidityProfile({
      boundaries: [-200, -100, 0, 100],
      liquidities: [10n ** 18n, 10n ** 18n, 10n ** 18n],
      currentTick: 50,
      currentSqrtPriceX96: sqrtPriceX96,
      ...args,
    });
    expect(bins).toHaveLength(3);
    expect(bins[0].baseTokenAmount).toBe(0);
    expect(bins[0].quoteTokenAmount).toBeGreaterThan(0);
    expect(bins[2].baseTokenAmount).toBeGreaterThan(0);
  });

  it('throws on an inconsistent profile', () => {
    expect(() =>
      binsFromLiquidityProfile({
        boundaries: [0, 10],
        liquidities: [1n, 2n],
        currentTick: 0,
        currentSqrtPriceX96: sqrtPriceX96,
        ...args,
      }),
    ).toThrow(/inconsistent/);
  });
});

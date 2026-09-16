/**
 * pool-info for a Uniswap V4 pool.
 *
 * Reached from `poolInfo.ts` when the requested pool is a 32-byte id. The V3 path reads
 * a pool contract; there is no such contract here, so everything comes out of
 * PoolManager storage via `uniswap.v4.ts` — see that module for why the reads are shaped
 * the way they are.
 *
 * One field means something slightly different than it does for V3.
 * `baseTokenAmount`/`quoteTokenAmount` are integrated from the pool's liquidity profile
 * rather than read as token balances, because the V4 singleton holds every pool's tokens
 * together and has no per-pool balance to report. They are therefore the reserves backed
 * by liquidity, and exclude uncollected LP fees and accrued protocol fees, which a V3
 * pool's `balanceOf` does include.
 */

import { FastifyInstance } from 'fastify';

import { PoolInfo } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { binsFromLiquidityProfile } from '../../clmm-v3-utils';
import { uniswapSqrtPriceMath, uniswapTickMath } from '../uniswap.utils';
import {
  assertV4ProfileMatchesState,
  getV4InitializedTicks,
  getV4PoolState,
  resolveV4Currency,
  resolveV4PoolKey,
  v4LiquidityAt,
  v4LiquidityProfile,
} from '../uniswap.v4';

export async function getV4PoolInfo(
  fastify: FastifyInstance,
  network: string,
  poolId: string,
  binCount: number = 0,
): Promise<PoolInfo> {
  let key;
  let state;
  try {
    // The key has to come first: the tick bitmap is indexed by tickSpacing, which is
    // part of the key, so nothing else can be read until the key is known.
    key = await resolveV4PoolKey(network, poolId);
    state = await getV4PoolState(network, poolId);
  } catch (error: any) {
    throw fastify.httpErrors.notFound(error.message);
  }

  const [currency0, currency1] = await Promise.all([
    resolveV4Currency(network, key.currency0),
    resolveV4Currency(network, key.currency1),
  ]);

  // Same convention as the V3 route: currency0 is base, currency1 is quote.
  const isBaseToken0 = true;

  const ticks = await getV4InitializedTicks(network, poolId, key.tickSpacing);
  const profile = v4LiquidityProfile(ticks);
  assertV4ProfileMatchesState(poolId, profile, state);

  const sqrtPriceX96 = BigInt(state.sqrtPriceX96.toString());
  const mathArgs = {
    currentTick: state.tick,
    currentSqrtPriceX96: sqrtPriceX96,
    decimals0: currency0.decimals,
    decimals1: currency1.decimals,
    isBaseToken0,
    tickMath: uniswapTickMath,
    sqrtPriceMath: uniswapSqrtPriceMath,
  };

  // Reserves: the profile's own spans, totalled. Exact rather than windowed, so a
  // position sitting far from the current price still counts.
  const profileSpans = binsFromLiquidityProfile({
    boundaries: profile.boundaries,
    liquidities: profile.liquidities,
    ...mathArgs,
  });
  const baseTokenAmount = profileSpans.reduce((sum, span) => sum + span.baseTokenAmount, 0);
  const quoteTokenAmount = profileSpans.reduce((sum, span) => sum + span.quoteTokenAmount, 0);

  // Price from sqrtPriceX96 — never from the amounts above, and not from the tick
  // either: the tick is the floor of the price's log, so 1.0001^tick is the bottom of
  // the tick's range and can sit a basis point below the live price. The V3 route
  // reports the SDK's exact sqrtPriceX96-derived price, and this matches it. sqrtX96 is
  // under 2^160 and the ratio lands near 1, so a double carries ~15 significant
  // digits through the square — the same precision V3 reports.
  const sqrtRatio = Number(state.sqrtPriceX96.toString()) / 2 ** 96;
  const rawQuotePerBase = sqrtRatio * sqrtRatio * Math.pow(10, currency0.decimals - currency1.decimals);

  const result: PoolInfo = {
    address: poolId,
    baseTokenAddress: currency0.address,
    quoteTokenAddress: currency1.address,
    binStep: key.tickSpacing,
    // slot0's lpFee is the fee in force now, which a dynamic-fee hook can change; the
    // key's static fee is only its initial value. Reported in percent, as V3 does.
    feePct: state.lpFee / 10000,
    price: rawQuotePerBase,
    baseTokenAmount,
    quoteTokenAmount,
    activeBinId: state.tick,
  };

  if (binCount > 0) {
    // A uniform tickSpacing grid centred on the active tick, filled from the profile.
    // The grid is tickSpacing-aligned and initialized ticks are multiples of it, so no
    // tick can fall strictly inside a bin and each bin's liquidity is constant.
    const halfBins = Math.floor(binCount / 2);
    const snapped = Math.floor(state.tick / key.tickSpacing) * key.tickSpacing;
    const firstBinStart = snapped - halfBins * key.tickSpacing;
    const boundaries: number[] = [];
    for (let i = 0; i <= binCount; i++) {
      boundaries.push(firstBinStart + i * key.tickSpacing);
    }
    const liquidities = boundaries.slice(0, -1).map((tick) => v4LiquidityAt(profile, tick));
    result.bins = binsFromLiquidityProfile({ boundaries, liquidities, ...mathArgs });
  }

  logger.debug(
    `V4 pool ${poolId}: ${currency0.symbol}/${currency1.symbol} tickSpacing ${key.tickSpacing} ` +
      `hooks ${key.hooks} tick ${state.tick} across ${ticks.length} initialized ticks`,
  );

  return result;
}

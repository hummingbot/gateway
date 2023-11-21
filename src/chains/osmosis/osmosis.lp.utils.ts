// adapted from utils/pools.ts from createcosmoapp liquidity example

import BigNumber from 'bignumber.js';
import { Asset } from '@chain-registry/types';
import { Pool } from 'osmo-query/dist/codegen/osmosis/gamm/pool-models/balancer/balancerPool';
import { Coin } from 'osmo-query/dist/codegen/cosmos/base/v1beta1/coin';
import {
  calcPoolLiquidity,
  getPoolByGammName as _getPoolByGammName,
  convertGammTokenToDollarValue,
} from '@chasevoorhees/osmonauts-math-decimal';

import {
  PriceHash,
} from './osmosis.types';
import { Fee } from './osmosis.utils';

export const getPoolByGammName = (pools: Pool[], gammId: string): Pool => {
  return _getPoolByGammName(pools, gammId);
};

export const filterPools = (assets: Asset[], pools: Pool[], prices: PriceHash) => {
  return pools
    .filter(({ $typeUrl }) => !$typeUrl?.includes('stableswap'))
    .filter(({ poolAssets }) =>
      poolAssets != undefined &&
      poolAssets.every(
        ({ token }) =>
          prices[token.denom] &&
          !token.denom.startsWith('gamm/pool') &&
          assets.find(({ base }) => base === token.denom)
      )
    );
};

interface ExtendPoolProps {
  pool: Pool;
  fees: Fee[];
  balances: Coin[];
  lockedCoins: Coin[];
  prices: PriceHash;
}

export const extendPool = (assets: Asset[], {
  pool,
  fees,
  balances,
  lockedCoins,
  prices,
}: ExtendPoolProps) => {
  const liquidity = new BigNumber(calcPoolLiquidity(assets, pool, prices))
    .decimalPlaces(0)
    .toNumber();

  const feeData = fees.find((fee) => fee.pool_id === pool.id.toString());
  const volume24H = Math.round(Number(feeData?.volume_24h || 0));
  const volume7d = Math.round(Number(feeData?.volume_7d || 0));
  const fees7D = Math.round(Number(feeData?.fees_spent_7d || 0));

  const poolDenom = pool.totalShares?.denom;

  const balanceCoin = balances.find(({ denom }) => denom === poolDenom);
  const myLiquidity = balanceCoin
    ? convertGammTokenToDollarValue(assets, balanceCoin, pool, prices)
    : '0';

  const lockedCoin = lockedCoins.find(({ denom }) => denom === poolDenom);
  const bonded = lockedCoin
    ? convertGammTokenToDollarValue(assets, lockedCoin, pool, prices)
    : '0';

  return {
    ...pool,
    liquidity,
    volume24H,
    fees7D,
    volume7d,
    myLiquidity,
    bonded,
    denom: poolDenom,
  };
};

export type ExtendedPool = ReturnType<typeof extendPool>;

export const descByLiquidity = (pool1: ExtendedPool, pool2: ExtendedPool) => {
  return new BigNumber(pool1.liquidity).lt(pool2.liquidity) ? 1 : -1;
};

export const descByMyLiquidity = (pool1: ExtendedPool, pool2: ExtendedPool) => {
  return new BigNumber(pool1.myLiquidity).lt(pool2.myLiquidity) ? 1 : -1;
};

type Item = {
  denom: string;
  [key: string]: any;
};

export const getPoolsByDenom = (allPools: ExtendedPool[], items: Item[]) => {
  return items
    .filter(({ denom }) => allPools.find(({ denom: d }) => d === denom))
    .map(({ denom }) => {
      return allPools.find(({ denom: d }) => d === denom) as ExtendedPool;
    });
};

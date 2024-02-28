// adapted from utils/pools.ts from createcosmoapp liquidity example

import BigNumber from 'bignumber.js';
import { Asset } from '@chain-registry/types';
import { Pool } from 'osmojs/dist/codegen/osmosis/gamm/pool-models/balancer/balancerPool';
import { Coin } from 'osmo-query/dist/codegen/cosmos/base/v1beta1/coin';
import {
  calcPoolLiquidity,
  getPoolByGammName as _getPoolByGammName,
  convertGammTokenToDollarValue,
} from '@osmonauts/math';

import {
  // AnyPoolType,
  PriceHash,
  ExtendedPool
} from './osmosis.types';
import { Fee } from './osmosis.utils';

export const getPoolByGammName = (pools: Pool[], gammId: string): Pool => {
  return _getPoolByGammName(pools, gammId);
};

// '/osmosis.gamm.poolmodels.stableswap.v1beta1.Pool'
// SS pools are handled by neither filter case (out of spec)

export const filterPoolsSwapAndLP = (assets: Asset[], pools: ExtendedPool[], prices: PriceHash): ExtendedPool[] => {
  var poolsOut = pools.filter(({ $typeUrl }) => !$typeUrl?.includes('stableswap'))
  
  poolsOut = poolsOut.filter((pool) => {
    if (pool.poolAssets){
      return pool.poolAssets.every(
        (pAsset: { token: { denom: string; }; }) =>
          prices[pAsset.token.denom] &&
          !pAsset.token.denom.startsWith('gamm/pool') &&
          assets.find(({ base }) => base === pAsset.token.denom)
      )
    }
    else if (pool.token0){
      return prices[pool.token0] &&  prices[pool.token1] && assets.find(({ base }) => base === pool.token0) && assets.find(({ base }) => base === pool.token1);
    }
    return false;
  });
  
  return poolsOut;
}

export const filterPoolsSwap = (assets: Asset[], pools: ExtendedPool[], prices: PriceHash): ExtendedPool[] => {
  return pools
    .filter(({ $typeUrl }) => $typeUrl?.includes('gamm.v1beta1'))
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

export const filterPoolsLP = (assets: Asset[], pools: any[], prices: PriceHash) => {
  var poolsOut = pools.filter(({ $typeUrl }) => $typeUrl?.includes('concentratedliquidity'))
  poolsOut = poolsOut.filter((pool) => prices[pool.token0] &&  prices[pool.token1] && assets.find(({ base }) => base === pool.token0) && assets.find(({ base }) => base === pool.token1));
  return poolsOut;
};

interface ExtendPoolProps {
  pool: ExtendedPool;
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
}: ExtendPoolProps): ExtendedPool => {
  var liquidity = 0;
  if (pool.poolAssets){
    // if this is NOT a CL pool
    liquidity = new BigNumber(calcPoolLiquidity(assets, pool, prices))
    .decimalPlaces(0)
    .toNumber();
  }

  var volume24H = 0
  var volume7d = 0
  var fees7D = 0
  if (fees){
    const feeData = fees.find((fee) => fee.pool_id === pool.id.toString());
    volume24H = Math.round(Number(feeData?.volume_24h || 0));
    volume7d = Math.round(Number(feeData?.volume_7d || 0));
    fees7D = Math.round(Number(feeData?.fees_spent_7d || 0));
  }

  var poolDenom = '';
  if (pool.totalShares){
    // also don't exist for CL pools
    poolDenom = pool.totalShares?.denom;
  }

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

// export type ExtendedPool = ReturnType<typeof extendPool>;

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

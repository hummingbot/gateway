// adapted from utils/pools.ts from createcosmoapp liquidity example
import { Asset } from '@chain-registry/types';
import { Coin } from '@cosmjs/amino';
import {
  calcPoolLiquidity,
  getPoolByGammName as _getPoolByGammName,
  convertGammTokenToDollarValue,
} from '@osmonauts/math';
import { BigNumber } from 'bignumber.js';
import { Pool } from 'osmojs/osmosis/gamm/v1beta1/balancerPool';

import { CosmosAsset, AssetList } from '../../chains/cosmos/cosmos.universaltypes';

import { PriceHash, ExtendedPool } from './osmosis.types';
export const getPoolByGammName = (pools: Pool[], gammId: string): Pool => {
  return _getPoolByGammName(pools, gammId);
};

//latest pool types:
// $typeUrl: "/osmosis.gamm.poolmodels.stableswap.v1beta1.Pool",
// $typeUrl: "/osmosis.gamm.v1beta1.Pool",
// $typeUrl: "/osmosis.concentratedliquidity.v1beta1.Pool",
// $typeUrl: "/osmosis.cosmwasmpool.v1beta1.CosmWasmPool", // these have .codeId and .poolId instead of .id - but not using

// asset types are listed different by pool type:
const typeUrlAMM = 'osmosis.gamm.v1beta1.Pool'; // .poolAssets[].token.denom
const typeUrlCLMM = 'osmosis.concentratedliquidity.v1beta1.Pool'; // .token0 .token1
const typeUrlStableSwap = 'osmosis.gamm.poolmodels.stableswap.v1beta1.Pool'; // .poolLiquidity[].denom

export const getPoolByIdAndFilter = (
  assets: Asset[],
  pools: any[],
  prices: PriceHash,
  findPoolId: bigint,
  verifyAssetsAndPrices: boolean,
): ExtendedPool[] => {
  let poolsOut = pools.filter(({ id }) => id == findPoolId);
  if (verifyAssetsAndPrices) {
    poolsOut = poolsOut.filter((pool) => {
      if (pool.poolAssets) {
        return pool.poolAssets.every(
          (pAsset: { token: { denom: string } }) =>
            prices[pAsset.token.denom] && assets.find(({ base }) => base === pAsset.token.denom),
        );
      } else if (pool.token0) {
        if (pool.currentSqrtPrice && pool.currentSqrtPrice == '0') {
          // filter out totally dead pools on testnet
          return false;
        }
        return (
          prices[pool.token0] &&
          prices[pool.token1] &&
          assets.find(({ base }) => base === pool.token0) &&
          assets.find(({ base }) => base === pool.token1)
        );
      }
      return false;
    });
  }
  return poolsOut;
};

export const getPoolByAddressAndFilter = (
  assets: Asset[],
  pools: any[],
  prices: PriceHash,
  poolAddress: string,
  verifyAssetsAndPrices: boolean,
): ExtendedPool[] => {
  let poolsOut = pools.filter(({ address }) => address == poolAddress);
  if (verifyAssetsAndPrices) {
    poolsOut = poolsOut.filter((pool) => {
      if (pool.poolAssets) {
        return pool.poolAssets.every(
          (pAsset: { token: { denom: string } }) =>
            prices[pAsset.token.denom] && assets.find(({ base }) => base === pAsset.token.denom),
        );
      } else if (pool.token0) {
        if (pool.currentSqrtPrice && pool.currentSqrtPrice == '0') {
          // filter out totally dead pools on testnet
          return false;
        }
        return (
          prices[pool.token0] &&
          prices[pool.token1] &&
          assets.find(({ base }) => base === pool.token0) &&
          assets.find(({ base }) => base === pool.token1)
        );
      }
      return false;
    });
  }
  return poolsOut;
};

export const filterPoolsGAMM = (assets: Asset[], pools: any[], prices: PriceHash, verifyPrices: boolean = true) => {
  let poolsOut = pools.filter(({ $typeUrl }) => $typeUrl?.includes(typeUrlAMM));

  poolsOut = poolsOut.filter((pool) => {
    if (pool.poolAssets) {
      if (verifyPrices) {
        return pool.poolAssets.every(
          (pAsset: { token: { denom: string } }) =>
            prices[pAsset.token.denom] && assets.find(({ base }) => base === pAsset.token.denom),
        );
      } else {
        return pool.poolAssets.every((pAsset: { token: { denom: string } }) =>
          assets.find(({ base }) => base === pAsset.token.denom),
        );
      }
    } else if (pool.token0) {
      if (verifyPrices) {
        return (
          prices[pool.token0] &&
          prices[pool.token1] &&
          assets.find(({ base }) => base === pool.token0) &&
          assets.find(({ base }) => base === pool.token1)
        );
      } else {
        return assets.find(({ base }) => base === pool.token0) && assets.find(({ base }) => base === pool.token1);
      }
    }
    return false;
  });

  return poolsOut;
};

export const filterPoolsStableSwap = (assets: Asset[], pools: any[], prices: PriceHash, verifyPrices: boolean) => {
  let poolsOut = pools.filter(({ $typeUrl }) => $typeUrl?.includes(typeUrlStableSwap));

  poolsOut = poolsOut.filter((pool) => {
    if (pool.poolAssets) {
      if (verifyPrices) {
        return pool.poolAssets.every(
          (pAsset: { token: { denom: string } }) =>
            prices[pAsset.token.denom] && assets.find(({ base }) => base === pAsset.token.denom),
        );
      } else {
        return pool.poolAssets.every((pAsset: { token: { denom: string } }) =>
          assets.find(({ base }) => base === pAsset.token.denom),
        );
      }
    } else if (pool.token0) {
      if (verifyPrices) {
        return (
          prices[pool.token0] &&
          prices[pool.token1] &&
          assets.find(({ base }) => base === pool.token0) &&
          assets.find(({ base }) => base === pool.token1)
        );
      } else {
        return assets.find(({ base }) => base === pool.token0) && assets.find(({ base }) => base === pool.token1);
      }
    }
    return false;
  });

  return poolsOut;
};

export const filterPoolsCLMM = (assets: Asset[], pools: any[], prices: PriceHash, verifyPrices: boolean) => {
  let poolsOut = pools.filter(({ $typeUrl }) => $typeUrl?.includes(typeUrlCLMM));

  poolsOut = poolsOut.filter((pool) => {
    if (pool.poolAssets) {
      if (verifyPrices) {
        return pool.poolAssets.every(
          (pAsset: { token: { denom: string } }) =>
            prices[pAsset.token.denom] && assets.find(({ base }) => base === pAsset.token.denom),
        );
      } else {
        return pool.poolAssets.every((pAsset: { token: { denom: string } }) =>
          assets.find(({ base }) => base === pAsset.token.denom),
        );
      }
    } else if (pool.token0) {
      if (pool.currentSqrtPrice && pool.currentSqrtPrice == '0') {
        // filter out totally dead pools on testnet
        return false;
      }
      if (verifyPrices) {
        return (
          prices[pool.token0] &&
          prices[pool.token1] &&
          assets.find(({ base }) => base === pool.token0) &&
          assets.find(({ base }) => base === pool.token1)
        );
      } else {
        return assets.find(({ base }) => base === pool.token0) && assets.find(({ base }) => base === pool.token1);
      }
    }
    return false;
  });

  return poolsOut;
};

interface ExtendPoolProps {
  pool: ExtendedPool;
  fees: Fee[];
  balances: Coin[];
  lockedCoins: Coin[];
  prices: PriceHash;
}

export const extendPool = (
  assets: AssetList[],
  { pool, fees, balances, lockedCoins, prices }: ExtendPoolProps,
): ExtendedPool => {
  let liquidity = 0;
  if (pool.poolAssets) {
    // if this is NOT a CL pool
    //@ts-expect-error: Osmosis Case 2
    liquidity = new BigNumber(calcPoolLiquidity(assets, pool, prices)).decimalPlaces(0).toNumber();
  }

  let volume24H = 0;
  let volume7d = 0;
  let fees7D = 0;
  let swapFee = '';
  let exitFee = '';

  if (pool.id) {
    // removes cosmwasm pools
    if (pool.poolParams && pool.poolParams.swapFee) {
      swapFee = pool.poolParams.swapFee; // this might be a raw amount or need a *100, it's very unclear from docs.
    }
    if (pool.poolParams && pool.poolParams.exitFee) {
      exitFee = pool.poolParams.exitFee; // this might be a raw amount or need a *100, it's very unclear from docs.
    }
  }

  if (fees) {
    const feeData = fees.find((fee) => fee.pool_id === pool.id.toString());
    volume24H = Math.round(Number(feeData?.volume_24h || 0));
    volume7d = Math.round(Number(feeData?.volume_7d || 0));
    fees7D = Math.round(Number(feeData?.fees_spent_7d || 0));
  }

  let poolDenom = '';
  if (pool.totalShares) {
    // also don't exist for CL pools
    poolDenom = pool.totalShares?.denom;
  }

  const balanceCoin = balances.find(({ denom }) => denom === poolDenom);
  const myLiquidity = balanceCoin ? balanceCoin.amount : '0';
  const myLiquidityDollarValue = balanceCoin
    ? //@ts-expect-error: Osmosis Case 2
      convertGammTokenToDollarValue(assets, balanceCoin, pool, prices)
    : '0';

  const lockedCoin = lockedCoins.find(({ denom }) => denom === poolDenom);
  const bonded = lockedCoin
    ? //@ts-expect-error: Osmosis Case 2
      convertGammTokenToDollarValue(assets, lockedCoin, pool, prices)
    : '0';

  return {
    ...pool,
    liquidity,
    volume24H,
    fees7D,
    volume7d,
    myLiquidity,
    myLiquidityDollarValue,
    bonded,
    denom: poolDenom,
    exitFee: exitFee,
    swapFee: swapFee,
    incentivesAddress: pool.incentivesAddress ? pool.incentivesAddress : '',
    spreadRewardsAddress: pool.spreadRewardsAddress ? pool.spreadRewardsAddress : '',
  };
};

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

export interface Fee {
  pool_id: string;
  volume_24h: number;
  volume_7d: number;
  // fees_spent_24h: number;
  fees_spent_7d: number;
  fees_percentage: string;
  fee_swap?: string;
  fee_exit?: string;
}

// this api is deprecated - nowhere to get volume that i can find (for free)
export const fetchFees = async (): Promise<Fee[]> => {
  const url = 'https://api-osmosis.imperator.co/fees/v1/pools';
  return (
    fetch(url)
      // .then(handleError)
      .then((res) => res.json())
      .then((res) => res.data)
  );
};

// another API gone - parsing fees ourselves
export const parseFees = async (pools: ExtendedPool[]): Promise<Fee[]> => {
  const fees: Fee[] = [];
  pools.forEach((epool) => {
    if (epool.id) {
      // removes cosmwasm pools
      let fee_perc = '0';
      if (epool.poolParams && epool.poolParams.swapFee) {
        fee_perc = epool.poolParams.swapFee; // this might be a raw amount or need a *100, it's very unclear from docs.
      }
      let fee_exit = '0';
      if (epool.poolParams && epool.poolParams.exitFee) {
        fee_exit = epool.poolParams.exitFee; // this might be a raw amount or need a *100, it's very unclear from docs.
      }
      fees.push({
        pool_id: epool.id.toString(),
        volume_24h: epool.volume24H,
        volume_7d: epool.volume7d,
        fees_spent_7d: epool.fees7D,
        fee_exit: fee_exit,
        fees_percentage: fee_perc,
        fee_swap: fee_perc,
      });
    }
  });
  return fees;
};

export const CLMMMakePoolPairs = (tokenList, pools, liquidityLimit = 100_000) => {
  let pools_out = pools.filter(
    (pool) =>
      pool.token0 &&
      pool.token1 &&
      !pool.token0.startsWith('gamm') &&
      !pool.token1.startsWith('gamm') &&
      new BigNumber(pool.currentTickLiquidity).gte(liquidityLimit),
  );

  pools_out = pools_out.map((pool) => {
    const assetA = pool.token0;
    const assetAinfo = tokenList.find((token: CosmosAsset) => token.base === assetA);
    const assetB = pool.token1;
    const assetBinfo = tokenList.find((token: CosmosAsset) => token.base === assetB);
    if (!assetAinfo || !assetBinfo) return;
    return {
      poolId: typeof pool.id === 'string' ? pool.id : pool.id.toString(),
      poolAddress: pool.address,
      baseName: assetAinfo.display,
      baseSymbol: assetAinfo.symbol,
      baseAddress: assetAinfo.base,
      quoteName: assetBinfo.display,
      quoteSymbol: assetBinfo.symbol,
      quoteAddress: assetBinfo.base,
    };
  });

  return pools_out;
};

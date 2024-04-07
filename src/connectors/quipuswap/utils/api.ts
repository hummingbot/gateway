import BigNumber from "bignumber.js";
import { ResponseInterface } from 'swap-router-sdk/dist/interface/response.interface';
import { RoutePair } from "swap-router-sdk/dist/interface/route-pair.interface";
import { Optional, SupportedNetwork, Token } from "./shared/types";
import { getTokenSlug, getUniqArray, isExist, isMainnet } from "./shared/helpers";
import { KNOWN_DEX_TYPES, TEZ_TOKEN_MAINNET_WHITELISTED_POOLS_ADDRESSES, TOKEN_TOKEN_MAINNET_WHITELISTED_POOLS, networkTokens } from "./config/config";
import { extractTokensPools } from "./map.dex.pairs";
import { ZERO_AMOUNT_BN } from "./config/constants";
import { DexTypeEnum, RouteDirectionEnum } from "swap-router-sdk";
import { mapBackendToken } from "./shared/backend.token.map";
import { QUIPU_TOKEN, TEZOS_TOKEN, WTEZ_TOKEN } from "./config/tokens";


const optionalStringToBigNumber = (value: Optional<string>) => (isExist(value) ? new BigNumber(value) : undefined);


const getAllRouterPairs = (routePairsRes: ResponseInterface) => {
  const allPairs = routePairsRes.routePairs.map<RoutePair>(rawPair => ({
    ...rawPair,
    dexId: optionalStringToBigNumber(rawPair.dexId),
    dexType: rawPair.dexType,
    aTokenPool: new BigNumber(rawPair.aTokenPool),
    aTokenMultiplier: optionalStringToBigNumber(rawPair.aTokenMultiplier),
    bTokenPool: new BigNumber(rawPair.bTokenPool),
    bTokenMultiplier: optionalStringToBigNumber(rawPair.bTokenMultiplier),
    cTokenPool: optionalStringToBigNumber(rawPair.cTokenPool),
    cTokenMultiplier: optionalStringToBigNumber(rawPair.cTokenMultiplier),
    dTokenPool: optionalStringToBigNumber(rawPair.dTokenPool),
    dTokenMultiplier: optionalStringToBigNumber(rawPair.dTokenMultiplier),
    initialA: optionalStringToBigNumber(rawPair.initialA),
    futureA: optionalStringToBigNumber(rawPair.futureA),
    fees: rawPair.fees && {
      liquidityProvidersFee: optionalStringToBigNumber(rawPair.fees.liquidityProvidersFee),
      stakersFee: optionalStringToBigNumber(rawPair.fees.stakersFee),
      interfaceFee: optionalStringToBigNumber(rawPair.fees.interfaceFee),
      devFee: optionalStringToBigNumber(rawPair.fees.devFee),
      swapFee: optionalStringToBigNumber(rawPair.fees.swapFee),
      auctionFee: optionalStringToBigNumber(rawPair.fees.auctionFee)
    },
    liquidity: optionalStringToBigNumber(rawPair.liquidity),
    sqrtPrice: optionalStringToBigNumber(rawPair.sqrtPrice),
    curTickIndex: optionalStringToBigNumber(rawPair.curTickIndex),
    curTickWitness: optionalStringToBigNumber(rawPair.curTickWitness),
    ticks:
      rawPair.ticks &&
      Object.fromEntries(
        Object.entries(rawPair.ticks).map(([key, tick]) => [
          key,
          {
            prev: new BigNumber(tick.prev),
            next: new BigNumber(tick.next),
            sqrtPrice: new BigNumber(tick.sqrtPrice),
            tickCumulativeOutside: new BigNumber(tick.tickCumulativeOutside),
            liquidityNet: new BigNumber(tick.liquidityNet)
          }
        ])
      ),
    lastCumulative: rawPair.lastCumulative && {
      time: rawPair.lastCumulative.time,
      tick: {
        sum: new BigNumber(rawPair.lastCumulative.tick.sum),
        blockStartValue: new BigNumber(rawPair.lastCumulative.tick.blockStartValue)
      }
    }
  }));

  const filteredPairs = allPairs.filter(
    pair =>
      !pair.aTokenPool.isZero() &&
      !pair.bTokenPool.isZero() &&
      (!pair.cTokenPool || !pair.cTokenPool.isZero()) &&
      (!pair.dTokenPool || !pair.dTokenPool.isZero())
  );

  return filteredPairs;
};


const tokensMap = (network: SupportedNetwork) => new Map<string, Token>(
  networkTokens(network).tokens
    .map((token): [string, Token] => {
      const mappedToken = mapBackendToken(token);

      return [getTokenSlug(mappedToken), mappedToken];
    })
    .concat([
      [getTokenSlug(TEZOS_TOKEN), TEZOS_TOKEN],
      [getTokenSlug(WTEZ_TOKEN(network)), WTEZ_TOKEN(network)],
      [getTokenSlug(QUIPU_TOKEN(network)), QUIPU_TOKEN(network)]
    ])
);


export const getWhitelistedPairs = (routePairsRes: ResponseInterface, network: SupportedNetwork) => {
  const filteredPairs = getAllRouterPairs(routePairsRes);
  const routePairs = filteredPairs.filter(routePair => KNOWN_DEX_TYPES.includes(routePair.dexType));

  const whitelistedPairs = getUniqArray(
    routePairs
      .filter(pair => {
        try {
          extractTokensPools(
            {
              ...pair,
              aTokenAmount: ZERO_AMOUNT_BN,
              bTokenAmount: ZERO_AMOUNT_BN,
              direction: RouteDirectionEnum.Direct
            },
            tokensMap(network)
          );

          return (
            (pair.dexType !== DexTypeEnum.QuipuSwap && pair.dexType !== DexTypeEnum.QuipuSwapTokenToTokenDex) ||
            !isMainnet(network) ||
            TEZ_TOKEN_MAINNET_WHITELISTED_POOLS_ADDRESSES.includes(pair.dexAddress) ||
            TOKEN_TOKEN_MAINNET_WHITELISTED_POOLS.some(
              ({ address, id }) => pair.dexId?.eq(id) && pair.dexAddress === address
            )
          );
        } catch {
          return false;
        }
      })
      .map(({ dexType, dexAddress, dexId }) => ({ dexType, dexAddress, dexId })),
    ({ dexAddress, dexId }) => getTokenSlug({ contractAddress: dexAddress, fa2TokenId: dexId?.toNumber() })
  );

  return {
    routePairs,
    whitelistedPairs
  };
};
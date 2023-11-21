// import { AssetDenomUnit } from '@chain-registry/types';
// import { Duration } from 'osmo-query/dist/codegen/google/protobuf/duration';
// import { Gauge } from 'osmo-query/dist/codegen/osmosis/incentives/gauge';
// import { SuperfluidAsset } from 'osmo-query/dist/codegen/osmosis/superfluid/superfluid';
import { Coin } from 'osmo-query/dist/codegen/cosmos/base/v1beta1/coin';
// import { Trade as OsmonautsTrade} from '@chasevoorhees/osmonauts-math-decimal/dist/types' // sell, buy = Coin(denom, amount)
// import { Trade as OsmojsTrade } from 'osmojs/dist/codegen/osmosis/protorev/v1beta1/protorev'; // pool, tokenIn, tokenOut
import BigNumber from 'bignumber.js';
import { ExtendedPool } from './osmosis.lp.utils'
import { Pool as OsmosisPool, PoolAsset } from 'osmojs/dist/codegen/osmosis/gamm/pool-models/balancer/balancerPool';
export type Pool = OsmosisPool & ExtraPoolProperties;


import type {
  CoinDenom,
  Exponent,
  CoinSymbol,
  PriceHash,
  CoinGeckoToken,
  CoinGeckoUSD,
  CoinGeckoUSDResponse,
  CoinValue,
  CoinBalance,
  PoolAssetPretty,
  PoolTokenImage,
  PoolPretty,
  CalcPoolAprsParams,
  Trade,
  PrettyPair,
} from "@chasevoorhees/osmonauts-math-decimal/dist/types";

// will this work for type?
type calcPoolAprs = (...args: any) => any
// import {calcPoolAprs} from './osmosis.apr'

export interface Scenario {
  token: CoinBalance;
  ratio: string;
  symbol: string;
  amount: string;
  enoughCoinsExist: boolean;
  totalDollarValue?: string;
}

export interface Scenarios {
  [key: string]: Scenario[];
}

export {
  CoinDenom,
  Exponent,
  CoinSymbol,
  PriceHash,
  CoinGeckoToken,
  CoinGeckoUSD,
  CoinGeckoUSDResponse,
  CoinValue,
  CoinBalance,
  PoolAssetPretty,
  PoolTokenImage,
  PoolPretty,
  CalcPoolAprsParams,
  Trade,
  PrettyPair,
};

export type Peroid = '1' | '7' | '14';

export type PoolApr = {
  [K in Peroid]: ReturnType<calcPoolAprs>; // typeof calcPoolAprs
};


export type ExtraPoolProperties = {
  fees7D: number;
  volume24H: number;
  volume7d: number;
  liquidity: string | number;
  myLiquidity?: string | number;
  bonded?: string | number;
  apr: PoolApr;
};

// export interface Trade {
//   sell: Coin;
//   buy: Coin;
// }

export interface FetchedData {
  pools: Pool[];
  prices: PriceHash;
  balances: Coin[];
}

// export interface PrettyPair {
//   poolId: string;
//   poolAddress: string;
//   baseName: string;
//   baseSymbol: string;
//   baseAddress: string;
//   quoteName: string;
//   quoteSymbol: string;
//   quoteAddress: string;
// }

export interface SwapOptionType {
  /**
   * Required. Unique identifier for option.
   */
  value: string;
  /**
   * Display symbol name.
   */
  symbol: string;
  /**
   * Icon display for option.
   */
  icon?: {
    png?: string;
    jpeg?: string;
    svg?: string;
  };
  /**
   * Unit of the chain.
   */
  denom: string;
  amount: string;
  displayAmount: string;
  dollarValue: string;
  chainName: string;
}

export interface OsmosisExpectedTrade {
  routes: OsmosisExpectedTradeRoute[];
  expectedAmount: string;
  executionPrice: BigNumber;
  gasLimitEstimate: BigNumber;
  tokenInAmount: string;
  tokenInDenom: string;
  tokenOutDenom: string;
  gasUsed: string,
  gasWanted: string,
}
export interface OsmosisExpectedTradeRoute {
    poolId: string;
    swapFee: string;
    baseLogo?: {
      png?: string;
      svg?: string;
      jpeg?: string;
    };
    baseSymbol: string;
    quoteLogo?: {
      png?: string;
      svg?: string;
      jpeg?: string;
    };
    quoteSymbol: string;
    tokenOutDenom: string;
}

export interface SwapAmountInRoute {
  poolId: bigint ;
  tokenOutDenom: string;
}

export interface OsmosisExpectedTradeSwapOut {
  routes: {
    poolId: string;
    swapFee: string;
    baseLogo?: {
      png?: string;
      svg?: string;
      jpeg?: string;
    };
    baseSymbol: string;
    quoteLogo?: {
      png?: string;
      svg?: string;
      jpeg?: string;
    };
    quoteSymbol: string;
    tokenInDenom: string;
  }[];
  expectedAmount: string;
  executionPrice: BigNumber;
  gasLimitEstimate: BigNumber;
  tokenInDenom: string;
  tokenOutDenom: string;
}

export function ToLog_OsmosisExpectedTrade(trade: OsmosisExpectedTrade){
  var output = ''
  trade.routes.forEach((element)=>{
    output += 'poolId: '
    output += element.poolId;
    output += ', '
    output += 'swapFee: '
    output += element.swapFee;
    output += ', '
    output += 'baseSymbol: '
    output += element.baseSymbol;
    output += ', '
    output += 'quoteSymbol: '
    output += element.quoteSymbol;
    output += ', '
  })
  output += 'expectedAmount: '
  output += trade.expectedAmount;
  output += ', '
  output += 'executionPrice: '
  output += trade.executionPrice.toString();
  output += ', '
  output += 'gasLimitEstimate: '
  output += trade.gasLimitEstimate.toString();
  output += ', '
  return output
}

export interface ReduceLiquidityTransactionResponse extends TransactionResponse {
  token0: string;
  token1: string;
  amount0: string;
  amount1: string;
}

export interface TransactionResponse {
  transactionHash: string;
  code: number;
  events: TransactionEvent[];
  gasUsed: string;
  gasWanted: string;
  height: number;
  rawLog: string;
}

export interface AddPositionTransactionResponse extends TransactionResponse {
  rawLog: string;
  poolId: string;
  poolAddress: string;
  token0_finalamount: string;
  token1_finalamount: string;
  poolshares: string;
}

export interface TransactionEvent {
  attributes: TransactionEventAttribute[];
  type: string;
}
export interface TransactionEventAttribute {
  key: string;
  value: string;
}

export class SerializableExtendedPool {
  constructor(input: ExtendedPool) {
    this.$typeUrl = input.$typeUrl;
    this.address = input.address;
    this.id = input.id.toString();
    this.futurePoolGovernor = input.futurePoolGovernor;
    this.totalShares = input.totalShares;
    this.poolAssets = input.poolAssets;
    this.totalWeight = input.totalWeight;
    this.fees_volume24H = input.volume24H;
    this.fees_spent_7d = input.fees7D;
    this.fees_volume7d = input.volume7d;
    this.myLiquidityShares = input.liquidity;
    this.myLiquidityDollarValue = input.myLiquidity;
    this.my_bonded_shares = input.bonded;
    this.denom = input.denom;
  }
  $typeUrl?: string;
  address: string;
  id: string;
  // poolParams: PoolParams;
  futurePoolGovernor: string;
  totalShares: Coin;
  poolAssets: PoolAsset[];
  totalWeight: string;

  fees_volume24H: number;
  fees_spent_7d: number;
  fees_volume7d: number;
  myLiquidityShares: number;
  myLiquidityDollarValue: string;
  my_bonded_shares: string;
  denom: string;
}

// code:
// 1
// events:
// (7) [{…}, {…}, {…}, {…}, {…}, {…}, {…}]
// gasUsed:
// 67966
// gasWanted:
// 250000
// height:
// 3492765
// rawLog:
// 'failed to execute message; message index: 0: failed to find route for pool id (0)'
// transactionHash:
// '4433060F89AAD08E84716B98D20B73E84E12C7DFEA6C5F72B6585B6100B13FB6'


// TRADE

// code:
// 0
// events:

// gasUsed:
// 160167
// gasWanted:
// 250000
// height:
// 3507003
// rawLog:
// '[{"events":
    // [{"type":"coin_received",
    // "attributes":
    //     [{"key":"receiver","value":"osmo1g7ajkk295vactngp74shkfrprvjrdwn662dg26"},
    //     {"key":"amount"},
    //     {"key":"receiver","value":"osmo1mw0ac6rwlp5r8wapwk3zs6g29h8fcscxqakdzw9emkne6c8wjp9q0t3v8t"},
    //     {"key":"amount","value":"1000000uosmo"},
    //     {"key":"receiver","value":"osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs"},
    //     {"key":"amount","value":"3966uion"}]},
    // {"type":"coin_spent",
    // "attributes":
    //     [{"key":"spender","value":"osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs"},
    //     {"key":"…
    //     {"key":"sender","value":"osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs"},
    //     {"key":"amount"},
    //     {"key":"recipient","value":"osmo1mw0ac6rwlp5r8wapwk3zs6g29h8fcscxqakdzw9emkne6c8wjp9q0t3v8t"},
    //     {"key":"sender","value":"osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs"},
    //     {"key":"amount","value":"1000000uosmo"},
    //     {"key":"recipient","value":"osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs"},
    //     {"key":"sender","value":"osmo1mw0ac6rwlp5r8wapwk3zs6g29h8fcscxqakdzw9emkne6c8wjp9q0t3v8t"},
    //     {"key":"amount","value":"3966uion"}]}]}]'
// transactionHash:
// 'B48CCE7A474B7237DA60DF8BE6BA4BB64914E94445086D7D2D22218B8B045B26'


// ADD LIQUIDITY
  // code:
  // 0
  // events:
  // gasUsed:
  // 134375
  // gasWanted:
  // 250000
  // height:
  // 3523121
  // rawLog:
  // '[{"events":[{"type":"coin_received",
  // "attributes":[
  // {"key":"receiver","value":"osmo17svzplxq3dmkz0atv6vtepftvtfl5daxuajtzxjwchnyjumupg5q649708"},
  // {"key":"amount","value":"990uion,98159uosmo"},
  // {"key":"receiver","value":"osmo1c9y7crgg6y9pfkq0y8mqzknqz84c3etr0kpcvj"},
  // {"key":"amount","value":"57568515255656500gamm/pool/62"},
  // {"key":"receiver","value":"osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs"},
  // {"key":"amount","value":"57568515255656500gamm/pool/62"}]},
  // {"type":"coin_spent",
  // "attributes":[{"key":"spend…ey":"tokens_in","value":"990uion,98159uosmo"}]},
  // {"type":"transfer",
  // "attributes":[
  // {"key":"recipient","value":"osmo17svzplxq3dmkz0atv6vtepftvtfl5daxuajtzxjwchnyjumupg5q649708"},
  // {"key":"sender","value":"osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs"},
  // {"key":"amount","value":"990uion,98159uosmo"},
  // {"key":"recipient","value":"osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs"},
  // {"key":"sender","value":"osmo1c9y7crgg6y9pfkq0y8mqzknqz84c3etr0kpcvj"},
  // {"key":"amount","value":"57568515255656500gamm/pool/62"}]}]}]'
  // transactionHash:
  // 'F86D3C78DE05C3B4B96DCA44F29D7E7B1881C06B654F70B92406EA6E2766389F'


  // code:
  // 5
  // gasUsed:
  // 76935
  // gasWanted:
  // 250000
  // height:
  // 3558566
  // rawLog:
  // 'failed to execute message; message index: 0: 798uion is smaller than 990uion: insufficient funds'
  // transactionHash:
  // '331E8709F466ED00DD2DFA6BA2FD3BFF170725FE3BE3274951C4E92F8B7015B2'
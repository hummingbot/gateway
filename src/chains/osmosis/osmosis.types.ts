import { Coin } from 'osmo-query/dist/codegen/cosmos/base/v1beta1/coin';
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
} from "@osmonauts/math/dist/types";

type calcPoolAprs = (...args: any) => any

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

export interface FetchedData {
  pools: Pool[];
  prices: PriceHash;
  balances: Coin[];
}

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

export type AnyTransactionResponse = TransactionResponse | ReduceLiquidityTransactionResponse | AddPositionTransactionResponse

export interface CoinAndSymbol {
  base: string;
  amount: string;
  symbol: string;
}

export interface ReduceLiquidityTransactionResponse extends TransactionResponse {
  balances: CoinAndSymbol[];
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
import { Coin } from '@cosmjs/amino';
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
} from '@osmonauts/math/types';
import { Type } from '@sinclair/typebox';
import { Pool as CLPool } from 'osmo-query/osmosis/concentratedliquidity/v1beta1/pool';
import { CosmWasmPool as CWPool } from 'osmo-query/osmosis/cosmwasmpool/v1beta1/model/pool';
import { Pool as SSPool } from 'osmo-query/osmosis/gamm/poolmodels/stableswap/v1beta1/stableswap_pool';
import { Pool as BalancerPool, PoolAsset } from 'osmojs/osmosis/gamm/v1beta1/balancerPool';

import { CosmosAsset } from '../../chains/cosmos/cosmos.universaltypes';
type calcPoolAprs = (...args: any) => any;
export type Pool = BalancerPool & ExtraPoolProperties;
export type AnyPoolType = CLPool | BalancerPool | CWPool | SSPool;
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

export interface TradeInfo {
  baseToken: CosmosAsset;
  quoteToken: CosmosAsset;
  requestAmount: BigNumber;
  expectedTrade: OsmosisExpectedTrade;
}
export interface OsmosisExpectedTrade {
  routes: OsmosisExpectedTradeRoute[];
  tokenOutAmount: string;
  tokenOutAmountAfterSlippage: string;
  executionPrice: BigNumber;
  gasLimitEstimate: BigNumber;
  tokenInAmount: string;
  tokenInAmountAfterSlippage: string;
  tokenInDenom: string;
  tokenOutDenom: string;
  gasUsed: string;
  gasWanted: string;
  priceImpact: number;
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
  poolId: bigint;
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

export function ToLog_OsmosisExpectedTrade(trade: OsmosisExpectedTrade) {
  let output = '';
  trade.routes.forEach((element) => {
    output += 'poolId: ';
    output += element.poolId;
    output += ', ';
    output += 'swapFee: ';
    output += element.swapFee;
    output += ', ';
    output += 'baseSymbol: ';
    output += element.baseSymbol;
    output += ', ';
    output += 'quoteSymbol: ';
    output += element.quoteSymbol;
    output += ', ';
  });
  output += 'expectedAmount: ';
  output += trade.tokenOutAmount;
  output += 'expectedAmountAfterSlippage: ';
  output += trade.tokenOutAmountAfterSlippage;
  output += ', ';
  output += 'executionPrice: ';
  output += trade.executionPrice.toString();
  output += ', ';
  output += 'gasLimitEstimate: ';
  output += trade.gasLimitEstimate.toString();
  output += ', ';
  return output;
}

export type AnyTransactionResponse =
  | TransactionResponse
  | ReduceLiquidityTransactionResponse
  | AddPositionTransactionResponse;

export interface CoinAndSymbol {
  base: string;
  amount: string;
  symbol: string;
}

export interface ReduceLiquidityTransactionResponse extends TransactionResponse {
  balances: CoinAndSymbol[];
  gasPrice: number;
}

// returned from transfer()
export interface TransactionResponse {
  transactionHash: string;
  code: number;
  events: TransactionEvent[];
  gasUsed: string;
  gasWanted: string;
  gasPrice: number;
  height: number;
  rawLog: string;
  feeAmount: string;
  // feeAmount: Coin[];
}

// poll()
export interface PollTxResponse {
  code: number;
  codespace: string;
  data: string;
  events: TransactionEvent[];
  gasUsed: string | bigint;
  gasWanted: string | bigint;
  height: string | bigint;
  info: string;
  rawLog: string;
  timestamp: string;
  txhash: string;
}

export interface AddLiquidityRequest extends NetworkSelectionRequest {
  // now also cosmos add swap position OR cosmos add LP position
  address: string;
  token0: string;
  token1: string;
  amount0: string;
  amount1: string;
  fee?: string;
  lowerPrice?: string; // integer as string  // COSMOS - using this != undefined then call addpositionLP(), else: addposition()
  upperPrice?: string; // integer as string
  tokenId?: number; // COSMOS: poolId - will select one for you if not provided
  nonce?: number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  allowedSlippage?: string; // COSMOS: used to calc TokenMinAmount
  poolId?: string;
}

export interface AddLiquidityResponse {
  network: string;
  timestamp: number;
  latency: number;
  token0: string;
  token1: string;
  fee: string;
  tokenId: number; // COSMOS - this is poolId
  gasPrice: number | string; // COSMOS: string
  gasPriceToken: string;
  gasLimit: number;
  gasCost: string; // gasUsed for Cosmos
  gasWanted?: string;
  nonce: number;
  txHash: string | undefined;
  poolAddress?: string; // Cosmos only
  poolShares?: string; // Cosmos only
  token0FinalAmount?: string; // Cosmos only
  token1FinalAmount?: string; // Cosmos only
}

export interface CollectEarnedFeesRequest extends NetworkSelectionRequest {
  address: string;
  tokenId: number; // COSMOS - this is poolId
  nonce?: number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface RemoveLiquidityRequest extends CollectEarnedFeesRequest {
  decreasePercent?: number;
  allowedSlippage?: string;
}

export interface RemoveLiquidityResponse {
  network: string;
  timestamp: number;
  latency: number;
  tokenId: number; // COSMOS - this is poolId
  gasPrice: number | string; // COSMOS: string
  gasPriceToken: string;
  gasLimit: number | string;
  gasCost: string; // gasUsed for Cosmos
  nonce?: number;
  txHash: string | undefined;
  gasWanted?: string;
  balances?: CoinAndSymbol[];
  isCollectFees?: boolean;
}

export interface PositionRequest extends NetworkSelectionRequest {
  tokenId?: number; // COSMOS - this is poolId. requried for both
  address?: string; // COSMOS only/required (no idea how this works without address for others)
}

// export interface PollResponse {
//   network: string;
//   timestamp: number;
//   currentBlock: number;
//   txHash: string;
//   txStatus: number;
//   txBlock: number;
//   txData: CustomTransactionResponse | null;
//   txReceipt: CustomTransactionReceipt | null;
// }

// export interface CustomTransactionResponse
//   extends Omit<
//     ethers.providers.TransactionResponse,
//     'gasPrice' | 'gasLimit' | 'value'
//   > {
//   gasPrice: string | null;
//   gasLimit: string;
//   value: string;
// }

// export interface CustomTransactionReceipt
//   extends Omit<
//     ethers.providers.TransactionReceipt,
//     'gasUsed' | 'cumulativeGasUsed' | 'effectiveGasPrice'
//   > {
//   gasUsed: string;
//   cumulativeGasUsed: string;
//   effectiveGasPrice: string | null;
//   status: string;
// }

export interface AddPositionTransactionResponse extends TransactionResponse {
  rawLog: string;
  poolId: number; // this is GAMM only (sort of, we find it ourselves based on positonId for reducePosition())
  poolAddress: string;
  token0_finalamount: string;
  token1_finalamount: string;
  poolshares: string;
  gasPrice: number;
  positionId?: number; // this is CL only
}

export interface TransactionEvent {
  attributes: TransactionEventAttribute[];
  type: string;
}
export interface TransactionEventAttribute {
  key: string;
  value: string;
}

export interface PriceAndSerializableExtendedPools {
  pools: SerializableExtendedPool[];
  prices: string[];
}

export class SerializableExtendedPool {
  constructor(input: ExtendedPool) {
    this.$typeUrl = input.$typeUrl;
    this.address = input.address;
    this.id = input.id ? input.id.toString() : input.poolId!.toString();
    this.futurePoolGovernor = input.futurePoolGovernor;
    this.totalShares = input.totalShares;
    this.token0 = input.token0;
    this.token1 = input.token1;
    this.poolAssets = input.poolAssets;
    this.totalWeight = input.totalWeight;
    this.fees_volume24H = input.volume24H;
    this.fees_spent_7d = input.fees7D;
    this.fees_volume7d = input.volume7d;
    this.myLiquidityShares = input.myLiquidity ? Number(input.myLiquidity) : 0;
    this.myLiquidityDollarValue = input.myLiquidityDollarValue;
    this.my_bonded_shares = input.bonded;
    this.denom = input.denom;
    this.currentTick = input.currentTick ? input.currentTick.toString() : '0';
    this.exponentAtPriceOne = input.exponentAtPriceOne ? input.exponentAtPriceOne.toString() : '0';
    this.swapFee = input.poolParams ? input.poolParams.swapFee : '0';
    this.exitFee = input.poolParams ? input.poolParams.exitFee : '0';
    this.tickSpacing = input.tickSpacing ? input.tickSpacing.toString() : '0';
    this.incentivesAddress = input.incentivesAddress;
    this.spreadRewardsAddress = input.spreadRewardsAddress;
    this.currentTickLiquidity = input.currentTickLiquidity;
    this.poolLiquidity = input.poolLiquidity;
  }
  $typeUrl?: string;
  address: string;
  incentivesAddress?: string = ''; // CL
  spreadRewardsAddress?: string = ''; // CL
  id: string;
  // poolParams: PoolParams;
  futurePoolGovernor?: string;
  totalShares?: Coin;
  poolAssets?: PoolAsset[];
  totalWeight?: string;
  token0?: string;
  token1?: string;
  currentTick?: string;
  tickSpacing?: string;
  exponentAtPriceOne?: string;
  fees_volume24H: number;
  fees_spent_7d: number;
  fees_volume7d: number;
  currentTickLiquidity: string;
  myLiquidityShares: number;
  myLiquidityDollarValue: string;
  my_bonded_shares: string;
  denom: string;
  swapFee: string = '';
  exitFee: string = '';
  poolLiquidity: Coin[] = [{ amount: '', denom: '' }]; // stableswap
}

export class ExtendedPool {
  liquidity: number = 0;
  volume24H: number = 0;
  fees7D: number = 0;
  volume7d: number = 0;
  myLiquidity: string = '';
  myLiquidityDollarValue: string = '';
  bonded: string = '';
  denom: string = '';
  $typeUrl?: string | undefined;
  address: string = '';
  incentivesAddress: string = ''; // CL
  spreadRewardsAddress: string = ''; // CL
  totalWeight: string = '';
  token0: string = ''; // base token
  token1: string = ''; // quote token
  poolAssets: PoolAsset[] = [];
  id: bigint = BigInt(0);
  poolId: bigint = BigInt(0);
  currentTick: bigint = BigInt(0);
  exponentAtPriceOne: bigint = BigInt(0);
  poolParams: PoolParams = new PoolParams();
  futurePoolGovernor: string = '';
  totalShares: Coin = { amount: '', denom: '' };
  poolLiquidity: Coin[] = [{ amount: '', denom: '' }]; // stableswap
  swapFee: string = '';
  exitFee: string = '';
  tickSpacing: bigint = BigInt(0);
  currentTickLiquidity: string = '';
}

class PoolParams {
  swapFee: string = '';
  exitFee: string = '';
  smoothWeightChangeParams: undefined;
}

export const FetchPoolsRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Osmosis network to use',
      default: 'mainnet',
      enum: ['mainnet', 'testnet'],
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      minimum: 1,
      default: 10,
      description: 'Maximum number of pools to return',
      examples: [10],
    }),
  ),
  tokenA: Type.Optional(
    Type.String({
      description: 'First token symbol or address',
      examples: ['ION'],
    }),
  ),
  tokenB: Type.Optional(
    Type.String({
      description: 'Second token symbol or address',
      examples: ['OSMO'],
    }),
  ),
});

// TYPES BORROWED FROM PREVIOUS HBOT VERSION since I had to recitfy all my code to work with them anyway...
// TYPES BORROWED FROM PREVIOUS HBOT VERSION since I had to recitfy all my code to work with them anyway...

export interface PositionInfo {
  token0?: string | undefined;
  token1?: string | undefined;
  poolShares?: string; // COSMOS - GAMM pools only issue poolShares (no amount/unclaimedToken)
  fee?: string | undefined;
  lowerPrice?: string;
  upperPrice?: string;
  amount0?: string; // COSMOS - CL pools only
  amount1?: string; // COSMOS - CL pools only
  unclaimedToken0?: string; // COSMOS - CL pools only
  unclaimedToken1?: string; // COSMOS - CL pools only
  pools?: SerializableExtendedPool[];
}

export interface PositionResponse extends PositionInfo {
  network: string;
  timestamp: number;
  latency: number;
}

export interface NetworkSelectionRequest {
  chain: string; //the target chain (e.g. ethereum, avalanche, or harmony)
  network: string; // the target network of the chain (e.g. mainnet)
  connector?: string; //the target connector (e.g. uniswap or pangolin)
}
export interface TransferRequest extends NetworkSelectionRequest {
  to: string;
  from: string;
  amount: string;
  token: string;
}

export type TransferResponse = string | FullTransferResponse;

export interface FullTransferResponse {
  network: string;
  timestamp: number;
  latency: number;
  amount: string;
  gasPrice: string;
  gasLimit: string;
  gasUsed: string;
  gasWanted: string;
  txHash: string;
}
export type OrderType = 'LIMIT' | 'LIMIT_MAKER';
export type Side = 'BUY' | 'SELL';
export type PerpSide = 'LONG' | 'SHORT';

export interface PoolPriceRequest extends NetworkSelectionRequest {
  token0: string;
  token1: string;
  address?: string;
  fee?: string;
  period?: number;
  interval?: number;
  poolId?: string;
}

export interface PoolPriceResponse {
  token0: string;
  token1: string;
  fee?: string;
  period?: number;
  interval?: number;
  prices?: string[];
  pools?: SerializableExtendedPool[];
  network: string;
  timestamp: number;
  latency: number;
}

// TYPES BORROWED FROM PREVIOUS HBOT VERSION since I had to recitfy all my code to work with them anyway...
// TYPES BORROWED FROM PREVIOUS HBOT VERSION since I had to recitfy all my code to work with them anyway...

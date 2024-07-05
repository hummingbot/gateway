import {
  CoinAndSymbol,
  SerializableExtendedPool as CosmosSerializableExtendedPool,
} from '../chains/osmosis/osmosis.types';
import { PerpPosition } from '../connectors/perp/perp';
import {
  NetworkSelectionRequest,
  PositionInfo as LPPositionInfo,
} from '../services/common-interfaces';

export type OrderType = 'LIMIT' | 'LIMIT_MAKER';
export type Side = 'BUY' | 'SELL';
export type PerpSide = 'LONG' | 'SHORT';

export interface PriceRequest extends NetworkSelectionRequest {
  quote: string;
  base: string;
  amount: string;
  side: Side;
  allowedSlippage?: string;
  poolId?: string;
}

export interface PriceResponse {
  base: string;
  quote: string;
  amount: string;
  rawAmount: string;
  expectedAmount: string;
  price: string;
  network: string;
  timestamp: number;
  latency: number;
  gasPrice: number;
  gasPriceToken: string;
  gasLimit: number;
  gasCost: string; // also gasUsed for Cosmos prices
  gasWanted?: string;
}

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
  pools?: CosmosSerializableExtendedPool[];
  network: string;
  timestamp: number;
  latency: number;
}

export interface TradeRequest extends NetworkSelectionRequest {
  quote: string;
  base: string;
  amount: string;
  address: string;
  side: Side;
  limitPrice?: string; // integer as string
  nonce?: number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  allowedSlippage?: string;
  poolId?: string;
  mnemonic?: string;
}

export interface TradeResponse {
  network: string;
  timestamp: number;
  latency: number;
  base: string;
  quote: string;
  amount: string; // traderequest.amount
  finalAmountReceived?: string; // Cosmos
  rawAmount: string;
  finalAmountReceived_basetoken?: string; // Cosmos
  expectedIn?: string;
  expectedOut?: string; // Cosmos: expectedAmountReceived
  expectedPrice?: string; // Cosmos
  price: string; // Cosmos: finalPrice
  gasPrice: number;
  gasPriceToken: string;
  gasLimit: number;
  gasWanted?: string; // Cosmos
  gasCost: string; // Cosmos: gasUsed
  nonce?: number;
  txHash: string | any | undefined;
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

export interface PositionResponse extends LPPositionInfo {
  network: string;
  timestamp: number;
  latency: number;
}

export interface EstimateGasResponse {
  network: string;
  timestamp: number;
  gasPrice: number;
  gasPriceToken: string;
  gasLimit: number;
  gasCost: string;
}

export interface PerpPricesResponse {
  base: string;
  quote: string;
  network: string;
  timestamp: number;
  latency: number;
  markPrice: string;
  indexPrice: string;
  indexTwapPrice: string;
}

export interface PerpMarketRequest extends NetworkSelectionRequest {
  quote: string;
  base: string;
}

export interface PerpMarketResponse {
  network: string;
  timestamp: number;
  latency: number;
  base: string;
  quote: string;
  isActive: boolean;
}

export interface PerpBalanceRequest extends NetworkSelectionRequest {
  address: string;
}

export interface PerpBalanceResponse {
  network: string;
  timestamp: number;
  latency: number;
  balance: string;
}

export interface PerpPositionRequest extends PerpMarketRequest {
  address: string;
}

export interface PerpPositionResponse extends PerpPosition {
  network: string;
  timestamp: number;
  latency: number;
  base: string;
  quote: string;
}

export interface PerpAvailablePairsResponse {
  network: string;
  timestamp: number;
  latency: number;
  pairs: string[];
}

export interface PerpCreateTakerRequest extends NetworkSelectionRequest {
  quote: string;
  base: string;
  address: string;
  amount?: string;
  side?: PerpSide;
  allowedSlippage?: string;
  nonce?: number;
}

export interface PerpCreateTakerResponse {
  network: string;
  timestamp: number;
  latency: number;
  base: string;
  quote: string;
  amount: string;
  gasPrice: number;
  gasPriceToken: string;
  gasLimit: number;
  gasCost: string;
  nonce: number;
  txHash: string | undefined;
}

import {
  NetworkSelectionRequest,
} from '../services/common-interfaces';

export type OrderType = 'LIMIT' | 'LIMIT_MAKER';
export type Side = 'BUY' | 'SELL';

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
  expectedOut?: string;  // Cosmos: expectedAmountReceived
  expectedPrice?: string;  // Cosmos
  price: string; // Cosmos: finalPrice
  gasPrice: number;
  gasPriceToken: string;
  gasLimit: number;
  gasWanted?: string; // Cosmos
  gasCost: string; // Cosmos: gasUsed
  nonce?: number;
  txHash: string | any | undefined;
}

export interface EstimateGasResponse {
  network: string;
  timestamp: number;
  gasPrice: number;
  gasPriceToken: string;
  gasLimit: number;
  gasCost: string;
}

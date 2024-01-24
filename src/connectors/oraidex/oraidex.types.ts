import { AssetInfo } from '@oraichain/oraidex-contracts-sdk';
import { BigNumber } from 'bignumber.js';

//
//  Types and Constants
//

export type Fee = BigNumber;

export type FeeMaker = Fee;
export type FeeTaker = Fee;
export type FeeServiceProvider = Fee;

//
//  Enums
//
export enum OrderDirection {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderStatus {
  OPEN = 'OPEN',
  CANCELLED = 'CANCELLED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CREATION_PENDING = 'CREATION_PENDING',
  CANCELLATION_PENDING = 'CANCELLATION_PENDING',
  UNKNOWN = 'UNKNOWN',
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  IOC = 'IOC', // Immediate or Cancel
}

//
//  Interfaces
//
export interface Market {
  marketId: string;
  baseToken: AssetInfo;
  quoteToken: AssetInfo;
  min_quote_coin_amount: string;
  spread: string; // Also called tickSize
  fees: MarketFee;
}

export interface MarketFee {
  maker: FeeMaker;
  taker: FeeTaker;
  serviceProvider: FeeServiceProvider;
}

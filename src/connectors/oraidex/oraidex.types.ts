import { AssetInfo } from '@oraichain/oraidex-contracts-sdk';
import { BigNumber } from 'bignumber.js';
import { Map as ImmutableMap, Set as ImmutableSet } from 'immutable';
import {
  ClobDeleteOrderRequestExtract,
  CreateOrderParam,
} from '../../clob/clob.requests';

//
//  Types and Constants
//

export type IMap<K, V> = ImmutableMap<K, V>;
export const IMap = ImmutableMap;
export type ISet<V> = ImmutableSet<V>;
export const ISet = ImmutableSet;

export type Address = string;
export type OwnerAddress = Address;
export type OrderId = string;
export type Fee = BigNumber;
export type FeeMaker = Fee;
export type FeeTaker = Fee;
export type FeeServiceProvider = Fee;

export type MarketId = Address;

export type Token = {
  name: string;
  symbol: string;
  decimals: number;
  assetInfo: AssetInfo;
}

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
  baseToken: Token;
  quoteToken: Token;
  min_quote_coin_amount: string;
  spread: string; // Also called tickSize
  fees: MarketFee;
  minimumOrderSize: String;
  minimumPriceIncrement: String; // Also called tickSize
  minimumBaseAmountIncrement: String;
  minimumQuoteAmountIncrement: String;
}

export interface MarketFee {
  maker: FeeMaker;
  taker: FeeTaker;
}

export interface PlaceOrdersRequest {
  ownerAddress: string;
  orders: CreateOrderParam[];
}

export interface CancelOrdersRequest {
  ownerAddress: string;
  orders: ClobDeleteOrderRequestExtract[];
}

//
//  Errors
//
export class CLOBishError extends Error {}
export class MarketNotFoundError extends CLOBishError {}

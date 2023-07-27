import { Map as ImmutableMap, Set as ImmutableSet } from 'immutable';
import {
  BookOffer,
  TransactionStream,
  TransactionMetadata,
  Transaction,
} from 'xrpl';

export type IMap<K, V> = ImmutableMap<K, V>;
export const IMap = ImmutableMap;
export type ISet<V> = ImmutableSet<V>;
export const ISet = ImmutableSet;

export enum TradeType {
  BUY = 'BUY',
  SELL = 'SELL',
  UNKNOWN = 'UNKNOWN',
}

export enum OrderStatus {
  OPEN = 'OPEN',
  CANCELED = 'CANCELED',
  FILLED = 'FILLED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  PENDING_OPEN = 'PENDING_OPEN',
  PENDING_CANCEL = 'PENDING_CANCEL',
  FAILED = 'FAILED',
  OFFER_EXPIRED_OR_UNFUNDED = 'OFFER_EXPIRED_OR_UNFUNDED',
  UNKNOWN = 'UNKNOWN',
}

export enum OrderType {
  LIMIT = 'LIMIT',
  PASSIVE = 'PASSIVE',
  IOC = 'IOC', // Immediate or Cancel
  FOK = 'FOK', // Fill or Kill
  SELL = 'SELL', // Sell
}

export enum TransactionIntentType {
  OFFER_CREATE_FINALIZED = 'OfferCreateFinalized',
  OFFER_CANCEL_FINALIZED = 'OfferCancelFinalized',
  OFFER_PARTIAL_FILL = 'OfferPartialFill',
  OFFER_FILL = 'OfferFill',
  OFFER_EXPIRED_OR_UNFUNDED = 'OfferExpiredOrUnfunded',
  UNKNOWN = 'UNKNOWN',
}

export interface Token {
  currency: string;
  issuer: string;
  value: string;
}

export type GetMarketsRequest =
  | Record<string, never>
  | { name: string }
  | { names: string[] };

export interface GetMarketResponse {
  name: string;
  minimumOrderSize: number;
  tickSize: number;
  baseTransferRate: number;
  quoteTransferRate: number;
}

export interface Market {
  marketId: string;
  minimumOrderSize: number;
  tickSize: number;
  baseTransferRate: number;
  quoteTransferRate: number;
  baseIssuer: string;
  quoteIssuer: string;
  baseCurrency: string;
  quoteCurrency: string;
}

export type GetMarketsResponse =
  | IMap<string, GetMarketResponse>
  | GetMarketResponse;

export type GetTickersRequest =
  | Record<string, never>
  | { marketName: string }
  | { marketNames: string[] };

export interface GetTickerResponse {
  price: number;
  timestamp: number;
}

export type GetTickersResponse =
  | IMap<string, GetTickerResponse>
  | GetTickerResponse;

export interface Ticker {
  price: number;
  timestamp: number;
}

export interface GetOrderRequest {
  sequence: number;
  signature: string;
}

export type GetOrdersRequest =
  | Record<string, never>
  | { orders: GetOrderRequest[] };

export interface GetOrderResponse {
  sequence: number;
  status: OrderStatus;
  signature: string;
  transactionResult: string;
}

export type GetOrdersResponse = Record<number, GetOrderResponse>;

export type GetOrderBooksRequest =
  | Record<string, never>
  | { marketName: string; limit: number }
  | { marketNames: string[]; limit: number };

export interface GetOrderBookResponse {
  market: GetMarketResponse;
  topAsk: number;
  topBid: number;
  midPrice: number;
  bids: BookOffer[];
  asks: BookOffer[];
  timestamp: number;
}

export type GetOrderBooksResponse =
  | IMap<string, GetOrderBookResponse>
  | GetOrderBookResponse;

export interface CreateOrderRequest {
  walletAddress: string;
  marketName: string;
  side: TradeType;
  price: number;
  amount: number;
  type?: OrderType;
  sequence?: number;
}

export interface CreateOrderResponse {
  walletAddress: string;
  marketName: string;
  price: number;
  amount: number;
  side: TradeType;
  status?: OrderStatus;
  type?: OrderType;
  fee?: number;
  sequence: number;
  orderLedgerIndex?: string;
  signature?: string;
  transactionResult?: string;
}

export type CreateOrdersResponse =
  | IMap<number, CreateOrderResponse>
  | CreateOrderResponse
  | Record<number, CreateOrderResponse>;

export interface CancelOrderRequest {
  walletAddress: string;
  offerSequence: number;
}

export type CancelOrdersRequest =
  | Record<string, never>
  | { order: CancelOrderRequest }
  | { orders: CancelOrderRequest[] };

export interface CancelOrderResponse {
  walletAddress: string;
  status?: OrderStatus;
  signature?: string;
  transactionResult?: string;
}

export type CancelOrdersResponse =
  | IMap<number, CancelOrderResponse>
  | CancelOrderResponse
  | Record<number, CancelOrderResponse>;

export interface GetOpenOrderRequest {
  marketName: string;
  walletAddress: string;
}

export interface GetOpenOrderResponse {
  sequence: number;
  marketName: string;
  price: string;
  amount: string;
  side: TradeType;
}

export type GetOpenOrdersResponse =
  | any
  | IMap<string, IMap<number, GetOpenOrderResponse>>
  | IMap<number, GetOpenOrderResponse>
  | GetOpenOrderResponse;

export class XRPLishError extends Error {}

export class MarketNotFoundError extends XRPLishError {}

export interface PriceLevel {
  price: string;
  quantity: string;
  timestamp: number;
}
export interface Orderbook {
  buys: PriceLevel[];
  sells: PriceLevel[];
}

export interface Order {
  hash: number;
  marketId: string;
  price: string;
  amount: string;
  filledAmount: string;
  state: string;
  tradeType: string;
  orderType: string;
  createdAt: number;
  createdAtLedgerIndex: number;
  updatedAt: number;
  updatedAtLedgerIndex: number;
  associatedTxns: string[];
  associatedFills: FillData[];
}

export interface InflightOrders {
  [hash: number]: Order;
}

export interface OrderLocks {
  [key: number]: boolean;
}

export interface AccountTransaction {
  ledger_index: number;
  meta: string | TransactionMetadata;
  tx?: Transaction & ResponseOnlyTxInfo;
  tx_blob?: string;
  validated: boolean;
}

export interface TransaformedAccountTransaction {
  ledger_index: number;
  meta: TransactionMetadata;
  transaction: Transaction & ResponseOnlyTxInfo;
  tx_blob?: string;
  validated: boolean;
}

export interface ResponseOnlyTxInfo {
  date?: number;
  hash?: string;
  ledger_index?: number;
  inLedger?: number;
}

export interface TransactionIntent {
  type: TransactionIntentType;
  sequence?: number;
  tx: TransactionStream | TransaformedAccountTransaction;
  filledAmount?: string;
  node?: Node;
}

export interface FillData {
  tradeId: string;
  orderHash: number;
  price: string;
  quantity: string;
  feeToken: string;
  side: string;
  fee: string;
  timestamp: number;
  type: string;
}

type Node = CreatedNode | ModifiedNode | DeletedNode;

export interface CreatedNode {
  CreatedNode: {
    LedgerEntryType: string;
    LedgerIndex: string;
    NewFields: {
      [field: string]: unknown;
    };
  };
}
export interface ModifiedNode {
  ModifiedNode: {
    LedgerEntryType: string;
    LedgerIndex: string;
    FinalFields?: {
      [field: string]: unknown;
    };
    PreviousFields?: {
      [field: string]: unknown;
    };
    PreviousTxnID?: string;
    PreviousTxnLgrSeq?: number;
  };
}
export interface DeletedNode {
  DeletedNode: {
    LedgerEntryType: string;
    LedgerIndex: string;
    FinalFields: {
      [field: string]: unknown;
    };
    PreviousFields?: {
      [field: string]: unknown;
    };
  };
}

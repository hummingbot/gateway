import { NetworkSelectionRequest } from '../services/common-interfaces';
import { OrderType, Side } from '../amm/amm.requests';
import {
  FundingPayment,
  FundingRate,
  Orderbook,
  DerivativeMarket,
  SpotMarket,
  Position,
} from '@injectivelabs/sdk-ts';

export interface ClobMarketsRequest extends NetworkSelectionRequest {
  market?: string;
}

export interface CLOBMarkets {
  [key: string]: SpotMarket;
}

export interface ClobMarketResponse {
  network: string;
  timestamp: number;
  latency: number;
  markets: CLOBMarkets;
}

export type ClobTickerRequest = ClobMarketsRequest;

export type ClobTickerResponse = ClobMarketResponse;

export interface ClobOrderbookRequest extends ClobMarketsRequest {
  market: string;
}

export interface ClobOrderbookResponse {
  network: string;
  timestamp: number;
  latency: number;
  orderbook: Orderbook;
}

export interface ClobGetOrderRequest extends ClobOrderbookRequest {
  address: string;
  orderId: string;
}

export interface ClobGetOrderResponse {
  network: string;
  timestamp: number;
  latency: number;
  orders:
    | [
        {
          [key: string]: string;
        }
      ]
    | [];
}

export interface CreateOrderParam {
  price: string;
  amount: string;
  orderType: OrderType;
  side: Side;
  market: string;
}

export interface ClobPostOrderRequest
  extends NetworkSelectionRequest,
    CreateOrderParam {
  address: string;
}

export interface ClobDeleteOrderRequestExtract {
  market: string;
  orderId: string;
}

export interface ClobBatchUpdateRequest extends NetworkSelectionRequest {
  address: string;
  createOrderParams?: CreateOrderParam[];
  cancelOrderParams?: ClobDeleteOrderRequestExtract[];
}

export interface ClobPostOrderResponse {
  network: string;
  timestamp: number;
  latency: number;
  txHash: string;
}

export type ClobDeleteOrderRequest = ClobGetOrderRequest;

export type ClobDeleteOrderResponse = ClobPostOrderResponse;

// PerpClob requests and responses

export type PerpClobMarketRequest = ClobMarketsRequest;

export interface PerpClobMarkets {
  [key: string]: DerivativeMarket;
}

export interface PerpClobMarketResponse {
  network: string;
  timestamp: number;
  latency: number;
  markets: PerpClobMarkets;
}

export type PerpClobTickerRequest = PerpClobMarketRequest;

export type PerpClobTickerResponse = PerpClobMarketResponse;

export type PerpClobOrderbookRequest = ClobOrderbookRequest;

export type PerpClobOrderbookResponse = ClobOrderbookResponse;

export interface PerpClobGetOrderRequest extends NetworkSelectionRequest {
  market: string;
  address: string;
  orderHash?: string;
  direction?: string; // 'buy', 'sell', 'long', 'short'
  orderTypes?: string; // string like 'buy,sell,stop_buy,stop_sell,take_buy,take_sell,buy_po,sell_po'
  limit?: number; // 1 or greater, otherwise it gets all orders
}

export interface PerpClobGetOrderResponse {
  network: string;
  timestamp: number;
  latency: number;
  orders:
    | [
        {
          [key: string]: string;
        }
      ]
    | [];
}

export interface PerpClobPostOrderRequest extends ClobOrderbookRequest {
  address: string;
  side: Side;
  orderType: OrderType;
  price: string;
  amount: string;
  leverage: number;
}

export type PerpClobPostOrderResponse = ClobPostOrderResponse;

export interface PerpClobDeleteOrderRequest extends NetworkSelectionRequest {
  market: string;
  address: string;
  orderId: string;
}

export type PerpClobDeleteOrderResponse = PerpClobPostOrderResponse;

export interface PerpClobFundingRatesRequest extends NetworkSelectionRequest {
  market: string;
  skip?: number; // skip last n funding rates
  limit?: number; // 1 to 100
  endTime?: number; // Upper bound of funding rate timestamp
}

export interface PerpClobFundingRatesResponse {
  network: string;
  timestamp: number;
  latency: number;
  fundingRates: Array<FundingRate>;
}

export interface PerpClobFundingPaymentsRequest
  extends NetworkSelectionRequest {
  address: string;
  market: string;
}

export interface PerpClobFundingPaymentsResponse {
  network: string;
  timestamp: number;
  latency: number;
  fundingPayments: Array<FundingPayment>;
}

export interface PerpClobPositionRequest extends NetworkSelectionRequest {
  markets: Array<string>;
  address: string;
}

export interface PerpClobPositionResponse {
  network: string;
  timestamp: number;
  latency: number;
  positions: Array<Position>;
}

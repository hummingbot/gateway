import { NetworkSelectionRequest } from '../services/common-interfaces';
import { OrderType, Side } from '../amm/amm.requests';
import {
  FundingRate,
  Orderbook,
  DerivativeMarket,
  SpotMarket,
  ExchangePagination,
} from '@injectivelabs/sdk-ts';

export interface ClobMarketsRequest extends NetworkSelectionRequest {
  market?: string;
}

export interface CLOBMarkets {
  [key: string]: SpotMarket | DerivativeMarket;
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
  isDerivative?: boolean; // spot is default
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
  isDerivative?: boolean; // spot is default
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

export interface ClobPostOrderRequest extends ClobOrderbookRequest {
  address: string;
  side: Side;
  orderType: OrderType;
  price: string;
  amount: string;
  leverage?: number; // float
}

export interface ClobPostOrderResponse {
  network: string;
  timestamp: number;
  latency: number;
  txHash: string;
}

export type ClobDeleteOrderRequest = ClobGetOrderRequest;

export type ClobDeleteOrderResponse = ClobPostOrderResponse;

export interface ClobFundingRatesRequest extends NetworkSelectionRequest {
  marketId: string;
  skip?: number; // skip last n funding rates
  limit?: number; // 1 to 100
  endTime?: number; // Upper bound of funding rate timestamp
}

export interface ClobFundingRatesResponse {
  network: string;
  timestamp: number;
  latency: number;
  fundingRates: Array<FundingRate>;
  pagination: ExchangePagination;
}

// export type ClobFundingPaymentsRequest
// export type ClobFundingPaymentsResponse

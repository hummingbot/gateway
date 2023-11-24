import {
  DerivativeTrade,
  FundingPayment,
  Orderbook,
  PerpetualMarket,
  Position,
} from '@injectivelabs/sdk-ts';
import { OrderType, Side } from '../amm/amm.requests';
import { NetworkSelectionRequest } from '../services/common-interfaces';

export interface ClobMarketsRequest extends NetworkSelectionRequest {
  market?: string;
}

export interface CLOBMarkets {
  [key: string]: any;
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
  address?: string;
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
  clientOrderID?: string;
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
  clientOrderID?: string | string[];
}

export type ClobDeleteOrderRequest = ClobGetOrderRequest & { address: string };

export type ClobDeleteOrderResponse = ClobPostOrderResponse;

// PerpClob requests and responses

export type PerpClobMarketRequest = ClobMarketsRequest;

export interface PerpClobMarkets {
  [key: string]: PerpetualMarket;
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
  orderId?: string;
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

export interface CreatePerpOrderParam {
  price: string;
  amount: string;
  orderType: OrderType;
  side: Side;
  market: string;
  leverage: number;
}

export interface PerpClobPostOrderRequest
  extends NetworkSelectionRequest,
    CreatePerpOrderParam {
  address: string;
}

export type PerpClobPostOrderResponse = ClobPostOrderResponse;

export interface PerpClobDeleteOrderRequest extends NetworkSelectionRequest {
  market: string;
  address: string;
  orderId: string;
}

export type PerpClobDeleteOrderResponse = PerpClobPostOrderResponse;

export interface PerpClobBatchUpdateRequest extends NetworkSelectionRequest {
  address: string;
  createOrderParams?: CreatePerpOrderParam[];
  cancelOrderParams?: ClobDeleteOrderRequestExtract[];
}

export type PerpClobBatchUpdateResponse = ClobPostOrderResponse;

export interface PerpClobFundingInfoRequest extends NetworkSelectionRequest {
  market: string;
}

export interface FundingInfo {
  marketId: string;
  indexPrice: string;
  markPrice: string;
  fundingRate: string;
  nextFundingTimestamp: number;
}

export interface PerpClobFundingInfoResponse {
  network: string;
  timestamp: number;
  latency: number;
  fundingInfo: FundingInfo;
}

export interface PerpClobGetLastTradePriceRequest
  extends NetworkSelectionRequest {
  market: string;
}

export interface PerpClobGetLastTradePriceResponse {
  network: string;
  timestamp: number;
  latency: number;
  lastTradePrice: string;
}

export interface PerpClobGetTradesRequest extends NetworkSelectionRequest {
  market: string;
  address: string;
  orderId: string;
}

export interface PerpClobGetTradesResponse {
  network: string;
  timestamp: number;
  latency: number;
  trades: Array<DerivativeTrade>;
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

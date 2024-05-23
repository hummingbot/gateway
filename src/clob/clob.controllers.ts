/* eslint-disable prettier/prettier */
import { EstimateGasResponse } from '../amm/amm.requests';
import { latency } from '../services/base';
import { NetworkSelectionRequest } from '../services/common-interfaces';
import {
  getInitializedChain,
  getConnector,
} from '../services/connection-manager';
import {
  ClobBatchUpdateRequest,
  ClobDeleteOrderRequest,
  ClobDeleteOrderResponse,
  ClobGetOrderRequest,
  ClobGetOrderResponse,
  ClobMarketResponse,
  ClobMarketsRequest,
  ClobOrderbookRequest,
  ClobOrderbookResponse,
  ClobPostOrderRequest,
  ClobPostOrderResponse,
  ClobTickerRequest,
  ClobTickerResponse,
  PerpClobDeleteOrderRequest,
  PerpClobDeleteOrderResponse,
  PerpClobFundingInfoRequest,
  PerpClobFundingInfoResponse,
  PerpClobFundingPaymentsRequest,
  PerpClobFundingPaymentsResponse,
  PerpClobGetOrderRequest,
  PerpClobGetOrderResponse,
  PerpClobGetTradesRequest,
  PerpClobGetTradesResponse,
  PerpClobMarketRequest,
  PerpClobMarketResponse,
  PerpClobOrderbookRequest,
  PerpClobOrderbookResponse,
  PerpClobPositionRequest,
  PerpClobPositionResponse,
  PerpClobPostOrderRequest,
  PerpClobPostOrderResponse,
  PerpClobTickerRequest,
  PerpClobTickerResponse,
  PerpClobGetLastTradePriceRequest,
  PerpClobGetLastTradePriceResponse,
  PerpClobBatchUpdateRequest,
  PerpClobBatchUpdateResponse,
} from './clob.requests';
import {
  HttpException,
  TRADE_NOT_FOUND_ERROR_MESSAGE,
  TRADE_NOT_FOUND_ERROR_CODE,
} from '../services/error-handler';

/**
 * GET /clob/markets
 *
 * @param request
 */
export async function getMarkets(
  request: ClobMarketsRequest
): Promise<ClobMarketResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const result = await connector.markets(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    ...result,
  };
}

/**
 * GET /clob/orderBooks
 *
 * @param request
 */
export async function getOrderBooks(
  request: ClobOrderbookRequest
): Promise<ClobOrderbookResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const result = await connector.orderBook(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    ...result,
  };
}

/**
 * GET /clob/tickers
 *
 * @param request
 */
export async function getTickers(
  request: ClobTickerRequest
): Promise<ClobTickerResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const result = await connector.ticker(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    ...result,
  };
}

/**
 * GET /clob/orders
 *
 * @param request
 */
export async function getOrders(
  request: ClobGetOrderRequest
): Promise<ClobGetOrderResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const result = await connector.orders(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    ...result,
  };
}

/**
 * POST /clob/orders
 *
 * @param request
 */
export async function postOrder(
  request: ClobPostOrderRequest
): Promise<ClobPostOrderResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const result = await connector.postOrder(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    ...result,
  };
}

/**
 * DELETE /clob/orders
 *
 * @param request
 */
export async function deleteOrder(
  request: ClobDeleteOrderRequest
): Promise<ClobDeleteOrderResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const result = await connector.deleteOrder(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    ...result,
  };
}

/**
 * POST /batchOrders
 *
 *
 * @param request
 */
export async function batchOrders(
  request: ClobBatchUpdateRequest
): Promise<ClobDeleteOrderResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const result = await connector.batchOrders(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    ...result,
  };
}

/**
 * Estimate gas for a typical clob transaction.
 *
 * POST /clob/estimateGas
 *
 * @param request
 */
export async function estimateGas(
  request: NetworkSelectionRequest
): Promise<EstimateGasResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const gasEstimates = await connector.estimateGas(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    ...gasEstimates,
  } as EstimateGasResponse;
}

// PerpClob functions

export async function perpGetMarkets(
  request: PerpClobMarketRequest
): Promise<PerpClobMarketResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const result = await connector.markets(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    ...result,
  };
}

export async function perpGetOrderBooks(
  request: PerpClobOrderbookRequest
): Promise<PerpClobOrderbookResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const result = await connector.orderBook(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    ...result,
  };
}

export async function perpGetTickers(
  request: PerpClobTickerRequest
): Promise<PerpClobTickerResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const result = await connector.ticker(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    ...result,
  };
}

export async function perpGetOrders(
  request: PerpClobGetOrderRequest
): Promise<PerpClobGetOrderResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const orders = await connector.orders(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    orders,
  };
}

export async function perpPostOrder(
  request: PerpClobPostOrderRequest
): Promise<PerpClobPostOrderResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const result = await connector.postOrder(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    ...result,
  };
}

export async function perpDeleteOrder(
  request: PerpClobDeleteOrderRequest
): Promise<PerpClobDeleteOrderResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const result = await connector.deleteOrder(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    ...result,
  };
}

export async function perpEstimateGas(
  request: NetworkSelectionRequest
): Promise<EstimateGasResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const gasEstimates = await connector.estimateGas(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    ...gasEstimates,
  } as EstimateGasResponse;
}

export async function perpFundingInfo(
  request: PerpClobFundingInfoRequest
): Promise<PerpClobFundingInfoResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const result = await connector.fundingInfo(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    fundingInfo: result,
  };
}

export async function perpFundingPayments(
  request: PerpClobFundingPaymentsRequest
): Promise<PerpClobFundingPaymentsResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const result = await connector.fundingPayments(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    fundingPayments: result,
  };
}

export async function perpPositions(
  request: PerpClobPositionRequest
): Promise<PerpClobPositionResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const result = await connector.positions(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    positions: result,
  };
}

export async function perpTrades(
  request: PerpClobGetTradesRequest
): Promise<PerpClobGetTradesResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const trades = await connector.trades(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    trades,
  };
}

export async function perpLastTradePrice(
  request: PerpClobGetLastTradePriceRequest
): Promise<PerpClobGetLastTradePriceResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const lastTradePrice = await connector.lastTradePrice(request);

  if (lastTradePrice === null) {
    throw new HttpException(
      404,
      TRADE_NOT_FOUND_ERROR_MESSAGE,
      TRADE_NOT_FOUND_ERROR_CODE
    );
  } else {
    return {
      network: request.network,
      timestamp: startTimestamp,
      latency: latency(startTimestamp, Date.now()),
      lastTradePrice,
    };
  }
}

export async function perpBatchOrders(
  request: PerpClobBatchUpdateRequest
): Promise<PerpClobBatchUpdateResponse> {
  const startTimestamp: number = Date.now();
  await getInitializedChain(request.chain, request.network);
  const connector: any = await getConnector(
    request.chain,
    request.network,
    request.connector
  );
  const result = await connector.batchPerpOrders(request);
  return {
    network: request.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    ...result,
  };
}

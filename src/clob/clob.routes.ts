/* eslint-disable no-inner-declarations */
/* eslint-disable @typescript-eslint/ban-types */
import { Request, Response, Router } from 'express';
import { EstimateGasResponse } from '../amm/amm.requests';
import { validateEstimateGasRequest } from '../amm/amm.validators';
import { NetworkSelectionRequest } from '../services/common-interfaces';
import { asyncHandler } from '../services/error-handler';
import {
  batchOrders,
  deleteOrder,
  estimateGas,
  getMarkets,
  getOrderBooks,
  getOrders,
  getTickers,
  perpDeleteOrder,
  perpEstimateGas,
  perpFundingInfo,
  perpFundingPayments,
  perpGetMarkets,
  perpGetOrderBooks,
  perpGetOrders,
  perpGetTickers,
  perpPositions,
  perpPostOrder,
  perpTrades,
  postOrder,
  perpLastTradePrice,
} from './clob.controllers';
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
} from './clob.requests';
import {
  validateBasicRequest,
  validateBatchOrdersRequest,
  validateFundingInfoRequest,
  validateFundingPaymentsRequest,
  validateMarketRequest,
  validateOrderRequest,
  validatePerpOrderRequest,
  validatePerpTradesRequest,
  validatePositionsRequest,
  validatePostOrderRequest,
  validatePostPerpOrderRequest,
  validatePerpLastTradePrice,
} from './clob.validators';

export namespace CLOBRoutes {
  export const router = Router();

  router.get(
    '/markets',
    asyncHandler(
      async (
        req: Request<{}, {}, ClobMarketsRequest>,
        res: Response<ClobMarketResponse | string, {}>
      ) => {
        validateBasicRequest(req.query);
        res
          .status(200)
          .json(await getMarkets(req.query as unknown as ClobMarketsRequest));
      }
    )
  );

  router.get(
    '/orderBook',
    asyncHandler(
      async (
        req: Request<{}, {}, ClobOrderbookRequest>,
        res: Response<ClobOrderbookResponse | string, {}>
      ) => {
        validateMarketRequest(req.query);
        res
          .status(200)
          .json(
            await getOrderBooks(req.query as unknown as ClobOrderbookRequest)
          );
      }
    )
  );

  router.get(
    '/ticker',
    asyncHandler(
      async (
        req: Request<{}, {}, ClobTickerRequest>,
        res: Response<ClobTickerResponse | string, {}>
      ) => {
        validateBasicRequest(req.query);
        res
          .status(200)
          .json(await getTickers(req.query as unknown as ClobTickerRequest));
      }
    )
  );

  router.get(
    '/orders',
    asyncHandler(
      async (
        req: Request<{}, {}, ClobGetOrderRequest>,
        res: Response<ClobGetOrderResponse | string, {}>
      ) => {
        validateOrderRequest(req.query);
        res
          .status(200)
          .json(await getOrders(req.query as unknown as ClobGetOrderRequest));
      }
    )
  );

  router.post(
    '/orders',
    asyncHandler(
      async (
        req: Request<{}, {}, ClobPostOrderRequest>,
        res: Response<ClobPostOrderResponse | string, {}>
      ) => {
        validatePostOrderRequest(req.body);
        res.status(200).json(await postOrder(req.body));
      }
    )
  );

  router.delete(
    '/orders',
    asyncHandler(
      async (
        req: Request<{}, {}, ClobDeleteOrderRequest>,
        res: Response<ClobDeleteOrderResponse | string, {}>
      ) => {
        validateOrderRequest(req.body);
        res.status(200).json(await deleteOrder(req.body));
      }
    )
  );

  router.post(
    '/batchOrders',
    asyncHandler(
      async (
        req: Request<{}, {}, ClobBatchUpdateRequest>,
        res: Response<ClobPostOrderResponse | string, {}>
      ) => {
        validateBatchOrdersRequest(req.body);
        res.status(200).json(await batchOrders(req.body));
      }
    )
  );

  router.get(
    '/estimateGas',
    asyncHandler(
      async (
        req: Request<{}, {}, NetworkSelectionRequest>,
        res: Response<EstimateGasResponse | string, {}>
      ) => {
        validateEstimateGasRequest(req.query);
        res
          .status(200)
          .json(
            await estimateGas(req.query as unknown as NetworkSelectionRequest)
          );
      }
    )
  );
}

export namespace PerpClobRoutes {
  export const router = Router();

  router.get(
    '/markets',
    asyncHandler(
      async (
        req: Request<{}, {}, PerpClobMarketRequest>,
        res: Response<PerpClobMarketResponse | string, {}>
      ) => {
        validateBasicRequest(req.query);
        res
          .status(200)
          .json(
            await perpGetMarkets(req.query as unknown as PerpClobMarketRequest)
          );
      }
    )
  );

  router.get(
    '/orderBook',
    asyncHandler(
      async (
        req: Request<{}, {}, PerpClobOrderbookRequest>,
        res: Response<PerpClobOrderbookResponse | string, {}>
      ) => {
        validateMarketRequest(req.query);
        res
          .status(200)
          .json(
            await perpGetOrderBooks(
              req.query as unknown as PerpClobOrderbookRequest
            )
          );
      }
    )
  );

  router.get(
    '/ticker',
    asyncHandler(
      async (
        req: Request<{}, {}, PerpClobTickerRequest>,
        res: Response<PerpClobTickerResponse | string, {}>
      ) => {
        validateBasicRequest(req.query);
        res
          .status(200)
          .json(
            await perpGetTickers(req.query as unknown as PerpClobTickerRequest)
          );
      }
    )
  );

  router.get(
    '/orders',
    asyncHandler(
      async (
        req: Request<{}, {}, PerpClobGetOrderRequest>,
        res: Response<PerpClobGetOrderResponse | string, {}>
      ) => {
        validatePerpOrderRequest(req.query);
        res
          .status(200)
          .json(
            await perpGetOrders(req.query as unknown as PerpClobGetOrderRequest)
          );
      }
    )
  );

  router.post(
    '/orders',
    asyncHandler(
      async (
        req: Request<{}, {}, PerpClobPostOrderRequest>,
        res: Response<PerpClobPostOrderResponse | string, {}>
      ) => {
        validatePostPerpOrderRequest(req.body);
        res.status(200).json(await perpPostOrder(req.body));
      }
    )
  );

  router.delete(
    '/orders',
    asyncHandler(
      async (
        req: Request<{}, {}, PerpClobDeleteOrderRequest>,
        res: Response<PerpClobDeleteOrderResponse | string, {}>
      ) => {
        validateOrderRequest(req.body);
        res.status(200).json(await perpDeleteOrder(req.body));
      }
    )
  );

  router.get(
    '/estimateGas',
    asyncHandler(
      async (
        req: Request<{}, {}, NetworkSelectionRequest>,
        res: Response<EstimateGasResponse | string, {}>
      ) => {
        validateEstimateGasRequest(req.query);
        res
          .status(200)
          .json(
            await perpEstimateGas(
              req.query as unknown as NetworkSelectionRequest
            )
          );
      }
    )
  );

  router.post(
    '/funding/info',
    asyncHandler(
      async (
        req: Request<{}, {}, PerpClobFundingInfoRequest>,
        res: Response<PerpClobFundingInfoResponse, {}>
      ) => {
        validateFundingInfoRequest(req.body);
        res.status(200).json(await perpFundingInfo(req.body));
      }
    )
  );

  router.post(
    '/funding/payments',
    asyncHandler(
      async (
        req: Request<{}, {}, PerpClobFundingPaymentsRequest>,
        res: Response<PerpClobFundingPaymentsResponse, {}>
      ) => {
        validateFundingPaymentsRequest(req.body);
        res.status(200).json(await perpFundingPayments(req.body));
      }
    )
  );

  router.post(
    '/positions',
    asyncHandler(
      async (
        req: Request<{}, {}, PerpClobPositionRequest>,
        res: Response<PerpClobPositionResponse, {}>
      ) => {
        validatePositionsRequest(req.body);
        res.status(200).json(await perpPositions(req.body));
      }
    )
  );

  router.post(
    '/order/trades',
    asyncHandler(
      async (
        req: Request<{}, {}, PerpClobGetTradesRequest>,
        res: Response<PerpClobGetTradesResponse | string, {}>
      ) => {
        validatePerpTradesRequest(req.body);
        res
          .status(200)
          .json(
            await perpTrades(req.body as unknown as PerpClobGetTradesRequest)
          );
      }
    )
  );

  router.get(
    '/lastTradePrice',
    asyncHandler(
      async (
        req: Request<{}, {}, PerpClobGetLastTradePriceRequest>,
        res: Response<PerpClobGetLastTradePriceResponse, {}>
      ) => {
        validatePerpLastTradePrice(req.query);
        res
          .status(200)
          .json(
            await perpLastTradePrice(
              req.query as unknown as PerpClobGetLastTradePriceRequest
            )
          );
      }
    )
  );
}

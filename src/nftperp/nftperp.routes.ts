import { Router, Request, Response } from 'express';
import { asyncHandler } from '../services/error-handler';
import {
    supportedAmms,
    position,
    markPrice,
    indexPrice,
    fundingRate,
    openMarketOrder,
    openLimitOrder,
    updateLimitOrder,
    deleteLimitOrder,
    openLimitOrderBatch,
    updateLimitOrderBatch,
    deleteLimitOrderBatch,
    openTriggerOrder,
    deleteTriggerOrder,
    closePosition,
} from './nftperp.controllers';
import {
    validateNetworkSelectionRequest,
    validateNftPerpCommonRequest,
    validateCommonWriteTxRequest,
    validateGetPositionRequest,
} from './nftperp.validators';
import { NetworkSelectionRequest } from '../services/common-interfaces';
import {
    NftPerpCommonRequest,
    PriceResponse,
    OpenMarketOrderRequest,
    SupportedAmmResponse,
    PositionResponse,
    ExecuteTxResponse,
    OpenLimitOrderRequest,
    UpdateLimitOrderRequest,
    DeleteOrderRequest,
    OpenLimitOrderBatchRequest,
    UpdateLimitOrderBatchRequest,
    DeleteOrdersRequest,
    ClosePositionRequest,
    OpenTriggerOrderRequest,
    GetPositionRequest,

} from './nftperp.requests';

export namespace NftPerpRoutes {
    export const router = Router();

    router.post(
        '/supported',
        asyncHandler(
            async (
                req: Request<{}, {}, NetworkSelectionRequest>,
                res: Response<SupportedAmmResponse, {}>
            ) => {
                validateNetworkSelectionRequest(req.body);
                res.status(200).json(await supportedAmms(req.body));
            }
        )
    );

    router.post(
        '/position',
        asyncHandler(
            async (
                req: Request<{}, {}, GetPositionRequest>,
                res: Response<PositionResponse, {}>
            ) => {
                validateGetPositionRequest(req.body);
                res.status(200).json(await position(req.body));
            }
        )
    );

    router.post(
        '/markPrice',
        asyncHandler(
            async (
                req: Request<{}, {}, NftPerpCommonRequest>,
                res: Response<PriceResponse, {}>
            ) => {
                validateNftPerpCommonRequest(req.body);
                res.status(200).json(await markPrice(req.body));
            }
        )
    );

    router.post(
        '/indexPrice',
        asyncHandler(
            async (
                req: Request<{}, {}, NftPerpCommonRequest>,
                res: Response<PriceResponse, {}>
            ) => {
                validateNftPerpCommonRequest(req.body);
                res.status(200).json(await indexPrice(req.body));
            }
        )
    );

    router.post(
        '/fundingRate',
        asyncHandler(
            async (
                req: Request<{}, {}, NftPerpCommonRequest>,
                res: Response<PriceResponse, {}>
            ) => {
                validateNftPerpCommonRequest(req.body);
                res.status(200).json(await fundingRate(req.body));
            }
        )
    );

    router.post(
        '/openMarketOrder',
        asyncHandler(
            async (
                req: Request<{}, {}, OpenMarketOrderRequest>,
                res: Response<ExecuteTxResponse, {}>
            ) => {
                validateCommonWriteTxRequest(req.body);
                res.status(200).json(await openMarketOrder(req.body));
            }
        )
    );

    router.post(
        '/openLimitOrder',
        asyncHandler(
            async (
                req: Request<{}, {}, OpenLimitOrderRequest>,
                res: Response<ExecuteTxResponse, {}>
            ) => {
                validateCommonWriteTxRequest(req.body);
                res.status(200).json(await openLimitOrder(req.body));
            }
        )
    );

    router.post(
        '/updateLimitOrder',
        asyncHandler(
            async (
                req: Request<{}, {}, UpdateLimitOrderRequest>,
                res: Response<ExecuteTxResponse, {}>
            ) => {
                validateCommonWriteTxRequest(req.body);
                res.status(200).json(await updateLimitOrder(req.body));
            }
        )
    );

    router.post(
        '/deleteLimitOrder',
        asyncHandler(
            async (
                req: Request<{}, {}, DeleteOrderRequest>,
                res: Response<ExecuteTxResponse, {}>
            ) => {
                validateCommonWriteTxRequest(req.body);
                res.status(200).json(await deleteLimitOrder(req.body));
            }
        )
    );

    router.post(
        '/openLimitOrderBatch',
        asyncHandler(
            async (
                req: Request<{}, {}, OpenLimitOrderBatchRequest>,
                res: Response<ExecuteTxResponse, {}>
            ) => {
                validateCommonWriteTxRequest(req.body);
                res.status(200).json(await openLimitOrderBatch(req.body));
            }
        )
    );

    router.post(
        '/updateLimitOrderBatch',
        asyncHandler(
            async (
                req: Request<{}, {}, UpdateLimitOrderBatchRequest>,
                res: Response<ExecuteTxResponse, {}>
            ) => {
                validateCommonWriteTxRequest(req.body);
                res.status(200).json(await updateLimitOrderBatch(req.body));
            }
        )
    );

    router.post(
        '/deleteLimitOrderBatch',
        asyncHandler(
            async (
                req: Request<{}, {}, DeleteOrdersRequest>,
                res: Response<ExecuteTxResponse, {}>
            ) => {
                validateCommonWriteTxRequest(req.body);
                res.status(200).json(await deleteLimitOrderBatch(req.body));
            }
        )
    );

    router.post(
        '/openTriggerOrder',
        asyncHandler(
            async (
                req: Request<{}, {}, OpenTriggerOrderRequest>,
                res: Response<ExecuteTxResponse, {}>
            ) => {
                validateCommonWriteTxRequest(req.body);
                res.status(200).json(await openTriggerOrder(req.body));
            }
        )
    );

    router.post(
        '/deleteTriggerOrder',
        asyncHandler(
            async (
                req: Request<{}, {}, DeleteOrderRequest>,
                res: Response<ExecuteTxResponse, {}>
            ) => {
                validateCommonWriteTxRequest(req.body);
                res.status(200).json(await deleteTriggerOrder(req.body));
            }
        )
    );

    router.post(
        '/closePosition',
        asyncHandler(
            async (
                req: Request<{}, {}, ClosePositionRequest>,
                res: Response<ExecuteTxResponse, {}>
            ) => {
                validateCommonWriteTxRequest(req.body);
                res.status(200).json(await closePosition(req.body));
            }
        )
    );
}

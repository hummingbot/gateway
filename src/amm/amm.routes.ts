/* eslint-disable no-inner-declarations */
/* eslint-disable @typescript-eslint/ban-types */
import { Router, Request, Response } from 'express';
import { asyncHandler } from '../services/error-handler';
import {
  price,
  trade,
  estimatePerpGas,
  perpMarketPrices,
  perpOrder,
  getMarketStatus,
  perpPosition,
  perpPairs,
  positionInfo,
  addLiquidity,
  reduceLiquidity,
  collectFees,
  poolPrice,
  estimateGas,
  perpBalance,
  // cosmosPoolPrice,
  // cosmosPoolPositions,
  // cosmosAddLiquidity,
  // cosmosReduceLiquidity,
  // cosmosPrice
} from './amm.controllers';
import {
  EstimateGasResponse,
  PerpAvailablePairsResponse,
  PerpCreateTakerRequest,
  PerpCreateTakerResponse,
  PerpMarketRequest,
  PerpMarketResponse,
  PerpPositionRequest,
  PerpPositionResponse,
  PerpPricesResponse,
  PriceRequest,
  PriceResponse,
  TradeRequest,
  TradeResponse,
  AddLiquidityRequest,
  AddLiquidityResponse,
  RemoveLiquidityRequest,
  RemoveLiquidityResponse,
  CollectEarnedFeesRequest,
  PositionRequest,
  PositionResponse,
  PoolPriceRequest,
  PoolPriceResponse,
  PerpBalanceRequest,
  PerpBalanceResponse,
  CosmosAddLiquidityRequest,
  CosmosRemoveLiquidityRequest,
  CosmosAddLiquidityResponse,
  CosmosRemoveLiquidityResponse,
  CosmosPoolPriceRequest,
  CosmosPoolPriceResponse,
  CosmosPoolPositionsRequest,
  CosmosPoolPositionsResponse,
  CosmosPriceResponse,
  CosmosTradeResponse
} from './amm.requests';
import {
  validateEstimateGasRequest,
  validatePerpCloseTradeRequest,
  validatePerpMarketStatusRequest,
  validatePerpOpenTradeRequest,
  validatePerpPairsRequest,
  validatePerpPositionRequest,
  validatePriceRequest,
  validateTradeRequest,
  validateAddLiquidityRequest,
  validateRemoveLiquidityRequest,
  validateCollectFeeRequest,
  validatePositionRequest,
  validatePoolPriceRequest,
  validatePerpBalanceRequest,
  validateCosmosPriceRequest,
  validateCosmosAddLiquidityRequest,
  validateCosmosRemoveLiquidityRequest,
  validateCosmosPoolPositionsRequest,
  validateCosmosPoolPriceRequest,
} from './amm.validators';
import { NetworkSelectionRequest } from '../services/common-interfaces';

export namespace AmmRoutes {
  export const router = Router();
  
  router.post(
    '/price',
    asyncHandler(
      async (
        req: Request<{}, {}, PriceRequest>,
        res: Response<PriceResponse | CosmosPriceResponse | string, {}>
      ) => {
        if (req.body.chain == 'osmosis'){
          validateCosmosPriceRequest(req.body)
        }else{
          validatePriceRequest(req.body);
        }
        res.status(200).json(await price(req.body));
      }
    )
  );

  // router.post(
  //   '/price_cosmos',
  //   asyncHandler(
  //     async (
  //       req: Request<{}, {}, PriceRequest>,
  //       res: Response<CosmosPriceResponse | string, {}>
  //     ) => {
  //       validateCosmosPriceRequest(req.body);
  //       res.status(200).json(await cosmosPrice(req.body));
  //     }
  //   )
  // );

  router.post(
    '/trade',
    asyncHandler(
      async (
        req: Request<{}, {}, TradeRequest>,
        res: Response<TradeResponse | CosmosTradeResponse | string, {}>
      ) => {
        validateTradeRequest(req.body);
        res.status(200).json(await trade(req.body));
      }
    )
  );

  router.post(
    '/estimateGas',
    asyncHandler(
      async (
        req: Request<{}, {}, NetworkSelectionRequest>,
        res: Response<EstimateGasResponse | string, {}>
      ) => {
        validateEstimateGasRequest(req.body);
        res.status(200).json(await estimateGas(req.body));
      }
    )
  );
}

export namespace AmmLiquidityRoutes {
  export const router = Router();

  router.post(
    '/position',
    asyncHandler(
      async (
        req: Request<{}, {}, PositionRequest | CosmosPoolPositionsRequest>,
        res: Response<PositionResponse | CosmosPoolPositionsResponse | string, {}>
      ) => {
        if (req.body.chain == 'osmosis'){
          validateCosmosPoolPositionsRequest(req.body)
        }else{
          validatePositionRequest(req.body);
        }
        res.status(200).json(await positionInfo(req.body));
      }
    )
  );

  router.post(
    '/add',
    asyncHandler(
      async (
        req: Request<{}, {}, AddLiquidityRequest | CosmosAddLiquidityRequest>,
        res: Response<AddLiquidityResponse | CosmosAddLiquidityResponse | string, {}>
      ) => {
        if (req.body.chain == 'osmosis'){
          validateCosmosAddLiquidityRequest(req.body)
        }else{
          validateAddLiquidityRequest(req.body);
        }
        res.status(200).json(await addLiquidity(req.body));
      }
    )
  );

  router.post(
    '/remove',
    asyncHandler(
      async (
        req: Request<{}, {}, RemoveLiquidityRequest | CosmosRemoveLiquidityRequest>,
        res: Response<RemoveLiquidityResponse | CosmosRemoveLiquidityResponse | string, {}>
      ) => {
        if (req.body.chain == 'osmosis'){
          validateCosmosRemoveLiquidityRequest(req.body)
        }else{
          validateRemoveLiquidityRequest(req.body);
        }
        res.status(200).json(await reduceLiquidity(req.body));
      }
    )
  );

  // router.post(
  //   '/add_cosmos',
  //   asyncHandler(
  //     async (
  //       req: Request<{}, {}, CosmosAddLiquidityRequest>,
  //       res: Response<CosmosAddLiquidityResponse | string, {}>
  //     ) => {
  //       validateCosmosAddLiquidityRequest(req.body);
  //       res.status(200).json(await cosmosAddLiquidity(req.body));
  //     }
  //   )
  // );

  // router.post(
  //   '/remove_cosmos',
  //   asyncHandler(
  //     async (
  //       req: Request<{}, {}, CosmosRemoveLiquidityRequest>,
  //       res: Response<CosmosRemoveLiquidityResponse | string, {}>
  //     ) => {
  //       validateCosmosRemoveLiquidityRequest(req.body);
  //       res.status(200).json(await cosmosReduceLiquidity(req.body));
  //     }
  //   )
  // );

  router.post(
    '/collect_fees',
    asyncHandler(
      async (
        req: Request<{}, {}, CollectEarnedFeesRequest>,
        res: Response<RemoveLiquidityResponse | string, {}>
      ) => {
        validateCollectFeeRequest(req.body);
        res.status(200).json(await collectFees(req.body));
      }
    )
  );

  router.post(
    '/price',
    asyncHandler(
      async (
        req: Request<{}, {}, PoolPriceRequest | CosmosPoolPriceRequest>,
        res: Response<PoolPriceResponse | CosmosPoolPriceResponse | string, {}>
      ) => {
        if (req.body.chain == 'osmosis'){
          validateCosmosPoolPriceRequest(req.body)
        }else{
          validatePoolPriceRequest(req.body);
        }
        res.status(200).json(await poolPrice(req.body));
      }
    )
  );

  // router.post(
  //   '/price_cosmos',
  //   asyncHandler(
  //     async (
  //       req: Request<{}, {}, CosmosPoolPriceRequest>,
  //       res: Response<CosmosPoolPriceResponse | string, {}>
  //     ) => {
  //       validateCosmosPoolPriceRequest(req.body);
  //       res.status(200).json(await cosmosPoolPrice(req.body));
  //     }
  //   )
  // );

  // router.post(
  //   '/positions_cosmos',
  //   asyncHandler(
  //     async (
  //       req: Request<{}, {}, CosmosPoolPositionsRequest>,
  //       res: Response<CosmosPoolPositionsResponse | string, {}>
  //     ) => {
  //       validateCosmosPoolPositionsRequest(req.body);
  //       res.status(200).json(await cosmosPoolPositions(req.body));
  //     }
  //   )
  // );
}

export namespace PerpAmmRoutes {
  export const router = Router();

  router.post(
    '/market-prices',
    asyncHandler(
      async (
        req: Request<{}, {}, PriceRequest>,
        res: Response<PerpPricesResponse | string, {}>
      ) => {
        validatePerpMarketStatusRequest(req.body);
        res.status(200).json(await perpMarketPrices(req.body));
      }
    )
  );

  router.post(
    '/market-status',
    asyncHandler(
      async (
        req: Request<{}, {}, PerpMarketRequest>,
        res: Response<PerpMarketResponse | string, {}>
      ) => {
        validatePerpMarketStatusRequest(req.body);
        res.status(200).json(await getMarketStatus(req.body));
      }
    )
  );

  router.post(
    '/pairs',
    asyncHandler(
      async (
        req: Request<{}, {}, NetworkSelectionRequest>,
        res: Response<PerpAvailablePairsResponse | string, {}>
      ) => {
        validatePerpPairsRequest(req.body);
        res.status(200).json(await perpPairs(req.body));
      }
    )
  );

  router.post(
    '/position',
    asyncHandler(
      async (
        req: Request<{}, {}, PerpPositionRequest>,
        res: Response<PerpPositionResponse | string, {}>
      ) => {
        validatePerpPositionRequest(req.body);
        res.status(200).json(await perpPosition(req.body));
      }
    )
  );

  router.post(
    '/balance',
    asyncHandler(
      async (
        req: Request<{}, {}, PerpBalanceRequest>,
        res: Response<PerpBalanceResponse | string, {}>
      ) => {
        validatePerpBalanceRequest(req.body);
        res.status(200).json(await perpBalance(req.body));
      }
    )
  );

  router.post(
    '/open',
    asyncHandler(
      async (
        req: Request<{}, {}, PerpCreateTakerRequest>,
        res: Response<PerpCreateTakerResponse | string, {}>
      ) => {
        validatePerpOpenTradeRequest(req.body);
        res.status(200).json(await perpOrder(req.body, true));
      }
    )
  );

  router.post(
    '/close',
    asyncHandler(
      async (
        req: Request<{}, {}, PerpCreateTakerRequest>,
        res: Response<PerpCreateTakerResponse | string, {}>
      ) => {
        validatePerpCloseTradeRequest(req.body);
        res.status(200).json(await perpOrder(req.body, false));
      }
    )
  );

  router.post(
    '/estimateGas',
    asyncHandler(
      async (
        req: Request<{}, {}, NetworkSelectionRequest>,
        res: Response<EstimateGasResponse | string, {}>
      ) => {
        validateEstimateGasRequest(req.body);
        res.status(200).json(await estimatePerpGas(req.body));
      }
    )
  );
}


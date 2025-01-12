import { FastifyPluginAsync } from 'fastify';
import { price, trade, estimateGas } from '../../amm/amm.controllers';
import {
  PriceRequest,
  PriceResponse,
  TradeRequest,
  TradeResponse,
  EstimateGasResponse,
  PriceRequestSchema,
  PriceResponseSchema,
  TradeRequestSchema,
  TradeResponseSchema,
  EstimateGasResponseSchema
} from '../../amm/amm.requests';
import {
  validateEstimateGasRequest,
  validatePriceRequest,
  validateTradeRequest,
} from '../../amm/amm.validators';
import { NetworkSelectionSchema, NetworkSelectionRequest } from '../../services/common-interfaces';

export const uniswapRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /uniswap/price
  fastify.post<{ Body: PriceRequest; Reply: PriceResponse }>(
    '/price',
    {
      schema: {
        description: 'Get Uniswap price quote',
        tags: ['uniswap'],
        body: PriceRequestSchema,
        response: {
          200: PriceResponseSchema
        }
      }
    },
    async (request) => {
      validatePriceRequest(request.body);
      return await price(request.body);
    }
  );

  // POST /uniswap/trade
  fastify.post<{ Body: TradeRequest; Reply: TradeResponse }>(
    '/trade',
    {
      schema: {
        description: 'Execute Uniswap trade',
        tags: ['uniswap'],
        body: TradeRequestSchema,
        response: {
          200: TradeResponseSchema
        }
      }
    },
    async (request) => {
      validateTradeRequest(request.body);
      return await trade(request.body);
    }
  );

  // POST /uniswap/estimateGas
  fastify.post<{ Body: NetworkSelectionRequest; Reply: EstimateGasResponse }>(
    '/estimateGas',
    {
      schema: {
        description: 'Estimate Uniswap gas',
        tags: ['uniswap'],
        body: NetworkSelectionSchema,
        response: {
          200: EstimateGasResponseSchema
        }
      }
    },
    async (request) => {
      validateEstimateGasRequest(request.body);
      return await estimateGas(request.body);
    }
  );
};

export default uniswapRoutes;

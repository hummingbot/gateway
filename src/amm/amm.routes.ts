import { FastifyPluginAsync } from 'fastify';
import { price, trade, estimateGas } from './amm.controllers';
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
} from './amm.requests';
import {
  validateEstimateGasRequest,
  validatePriceRequest,
  validateTradeRequest,
} from './amm.validators';
import { NetworkSelectionSchema, NetworkSelectionRequest } from '../services/common-interfaces';

export const ammRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /price
  fastify.post<{ Body: PriceRequest; Reply: PriceResponse }>(
    '/price',
    {
      schema: {
        description: 'Get price quote',
        tags: ['amm'],
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

  // POST /trade
  fastify.post<{ Body: TradeRequest; Reply: TradeResponse }>(
    '/trade',
    {
      schema: {
        description: 'Execute trade',
        tags: ['amm'],
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

  // POST /estimateGas
  fastify.post<{ Body: NetworkSelectionRequest; Reply: EstimateGasResponse }>(
    '/estimateGas',
    {
      schema: {
        description: 'Estimate gas',
        tags: ['amm'],
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

export default ammRoutes;

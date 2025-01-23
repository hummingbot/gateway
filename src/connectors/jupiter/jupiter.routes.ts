import { FastifyPluginAsync } from 'fastify';
import { Solana } from '../../chains/solana/solana';
import { Jupiter } from './jupiter';
import { price, trade, estimateGas } from './jupiter.controllers';
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
} from '../connector.requests';
import {
  validateEstimateGasRequest,
  validatePriceRequest,
  validateTradeRequest,
} from '../connector.validators';
import { NetworkSelectionSchema, NetworkSelectionRequest } from '../../services/common-interfaces';

export const jupiterRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /jupiter/price
  fastify.post<{ Body: PriceRequest; Reply: PriceResponse }>(
    '/price',
    {
      schema: {
        description: 'Get Jupiter price quote',
        tags: ['jupiter'],
        body: PriceRequestSchema,
        response: {
          200: PriceResponseSchema
        }
      }
    },
    async (request) => {
      validatePriceRequest(request.body);
      const solana = Solana.getInstance(request.body.network);
      const jupiter = Jupiter.getInstance(request.body.network);
      return await price(solana, jupiter, request.body);
    }
  );

  // POST /jupiter/trade
  fastify.post<{ Body: TradeRequest; Reply: TradeResponse }>(
    '/trade',
    {
      schema: {
        description: 'Execute Jupiter trade',
        tags: ['jupiter'],
        body: TradeRequestSchema,
        response: {
          200: TradeResponseSchema
        }
      }
    },
    async (request) => {
      validateTradeRequest(request.body);
      const solana = Solana.getInstance(request.body.network);
      const jupiter = Jupiter.getInstance(request.body.network);
      return await trade(solana, jupiter, request.body);
    }
  );

  // POST /jupiter/estimateGas
  fastify.post<{ Body: NetworkSelectionRequest; Reply: EstimateGasResponse }>(
    '/estimateGas',
    {
      schema: {
        description: 'Estimate Jupiter gas',
        tags: ['jupiter'],
        body: NetworkSelectionSchema,
        response: {
          200: EstimateGasResponseSchema
        }
      }
    },
    async (request) => {
      validateEstimateGasRequest(request.body);
      const solana = Solana.getInstance(request.body.network);
      const jupiter = Jupiter.getInstance(request.body.network);
      return await estimateGas(solana, jupiter);
    }
  );
};

export default jupiterRoutes;
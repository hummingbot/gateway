import { FastifyPluginAsync } from 'fastify';
import { Ethereum } from '../../chains/ethereum/ethereum';
import { Uniswap } from './uniswap';
import { price, trade, estimateGas } from './uniswap.controllers';
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
      const ethereumish = Ethereum.getInstance(request.body.network);
      const uniswapish = Uniswap.getInstance(request.body.chain, request.body.network);
      return await price(ethereumish, uniswapish, request.body);
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
      const ethereumish = Ethereum.getInstance(request.body.network);
      const uniswapish = Uniswap.getInstance(request.body.chain, request.body.network);
      return await trade(ethereumish, uniswapish, request.body);
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
      const ethereumish = Ethereum.getInstance(request.body.network);
      const uniswapish = Uniswap.getInstance(request.body.chain, request.body.network);
      return await estimateGas(ethereumish, uniswapish);
    }
  );
};

export default uniswapRoutes;

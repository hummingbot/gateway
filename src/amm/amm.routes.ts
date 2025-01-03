import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import {
  price,
  trade,
  estimateGas,
} from './amm.controllers';
import {
  EstimateGasResponse,
  PriceRequest,
  PriceResponse,
  TradeRequest,
  TradeResponse,
} from './amm.requests';
import {
  validateEstimateGasRequest,
  validatePriceRequest,
  validateTradeRequest,
} from './amm.validators';
import { NetworkSelectionRequest } from '../services/common-interfaces';

export const ammRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /price
  fastify.post<{ Body: PriceRequest; Reply: PriceResponse }>(
    '/price',
    {
      schema: {
        body: Type.Object({
          chain: Type.String(),
          network: Type.String(),
          connector: Type.String(),
          quote: Type.String(),
          base: Type.String(),
          amount: Type.String(),
          side: Type.String(),
        }),
        response: {
          200: Type.Object({
            base: Type.String(),
            quote: Type.String(),
            amount: Type.String(),
            rawAmount: Type.String(),
            expectedAmount: Type.String(),
            price: Type.String(),
            network: Type.String(),
            timestamp: Type.Number(),
            latency: Type.Number(),
            gasPrice: Type.Number(),
            gasPriceToken: Type.String(),
            gasLimit: Type.Number(),
            gasCost: Type.String(),
            gasWanted: Type.Optional(Type.String()),
          }),
        },
      },
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
        body: Type.Object({
          chain: Type.String(),
          network: Type.String(),
          connector: Type.String(),
          quote: Type.String(),
          base: Type.String(),
          amount: Type.String(),
          address: Type.String(),
          side: Type.String(),
          nonce: Type.Optional(Type.Number()),
        }),
        response: {
          200: Type.Object({
            network: Type.String(),
            timestamp: Type.Number(),
            latency: Type.Number(),
            base: Type.String(),
            quote: Type.String(),
            amount: Type.String(),
            finalAmountReceived: Type.Optional(Type.String()),
            rawAmount: Type.String(),
            finalAmountReceived_basetoken: Type.Optional(Type.String()),
            expectedIn: Type.Optional(Type.String()),
            expectedOut: Type.Optional(Type.String()),
            expectedPrice: Type.Optional(Type.String()),
            price: Type.String(),
            gasPrice: Type.Number(),
            gasPriceToken: Type.String(),
            gasLimit: Type.Number(),
            gasWanted: Type.Optional(Type.String()),
            gasCost: Type.String(),
            nonce: Type.Optional(Type.Number()),
            txHash: Type.Union([Type.String(), Type.Null()]),
          }),
        },
      },
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
        body: Type.Object({
          chain: Type.String(),
          network: Type.String(),
          connector: Type.String(),
        }),
        response: {
          200: Type.Object({
            network: Type.String(),
            timestamp: Type.Number(),
            gasPrice: Type.Number(),
            gasPriceToken: Type.String(),
            gasLimit: Type.Number(),
            gasCost: Type.String(),
          }),
        },
      },
    },
    async (request) => {
      validateEstimateGasRequest(request.body);
      return await estimateGas(request.body);
    }
  );
};

export default ammRoutes;

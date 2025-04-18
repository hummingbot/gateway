import { FastifyPluginAsync } from 'fastify';

import { Spectrum } from './spectrum';
import {
  PriceRequest,
  PriceResponse,
  TradeRequest,
  TradeResponse,
  PriceRequestSchema,
  PriceResponseSchema,
  TradeRequestSchema,
  TradeResponseSchema,
} from '../connector.requests';
import {
  validatePriceRequest,
  validateTradeRequest,
} from '../connector.validators';
import { StatusRequest } from '../../chains/chain.requests';
import { Type } from '@sinclair/typebox';
import { getInitializedChain } from '../../services/connection-manager';
import { Ergo } from '../../chains/ergo/ergo';
import { ErgoController } from '../../chains/ergo/ergo.controllers';
import {
  ExecuteSwapRequest,
  ExecuteSwapRequestType,
  ExecuteSwapResponse,
  ExecuteSwapResponseType,
  GetSwapQuoteRequest,
  GetSwapQuoteRequestType,
  GetSwapQuoteResponse,
  GetSwapQuoteResponseType,
} from '../../schemas/trading-types/swap-schema';
import { logger } from '../../services/logger';
import { getErgoConfig } from '../../chains/ergo/ergo.config';
import { SpectrumConfig } from './spectrum.config';

export const spectrumRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /ergo/status
  fastify.get<{ Querystring: StatusRequest }>(
    '/status',
    {
      schema: {
        tags: ['ergo'],
        description: 'Get Ergo chain status',
        querystring: Type.Object({
          network: Type.String(),
        }),
      },
    },
    async (request) => {
      const chain = Ergo.getInstance(request.query.network);

      return await ErgoController.getStatus(chain as Ergo, request.query);
    },
  );

  // POST /spectrum/estimateTrade
  fastify.post<{ Body: PriceRequest; Reply: PriceResponse }>(
    '/price',
    {
      schema: {
        description: 'Get spectrum price quote',
        tags: ['spectrum'],
        body: PriceRequestSchema,
        response: {
          200: PriceResponseSchema,
        },
      },
    },
    async (request) => {
      validatePriceRequest(request.body);
      const connector: Spectrum = Spectrum.getInstance(
        request.body.chain,
        request.body.network,
      );
      return await connector.estimateTrade(request.body);
    },
  );

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute Spectrum swap',
        tags: ['spectrum'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            walletAddress: { type: 'string', examples: [0x0] },
            baseToken: { type: 'string', examples: ['ERG'] },
            quoteToken: { type: 'string', examples: ['SIGUSD'] },
            amount: { type: 'number', examples: [0.1] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [1] },
            poolAddress: { type: 'string', examples: [''] },
          },
        },
        response: { 200: ExecuteSwapResponse },
      },
    },
    async (request) => {
      const {
        network,
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
      } = request.body;
      const connector: Spectrum = Spectrum.getInstance('ergo', network);
      return await connector.executeTrade({
        network: network || 'mainnet',
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side: side as 'BUY' | 'SELL',
        slippagePct,
      });
    },
  );
  fastify.get<{
    Querystring: GetSwapQuoteRequestType;
    Reply: GetSwapQuoteResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for Spectrum AMM',
        tags: ['spectrum/amm'],
        querystring: {
          ...GetSwapQuoteRequest,
          properties: {
            ...GetSwapQuoteRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            baseToken: { type: 'string', examples: ['ERG'] },
            quoteToken: { type: 'string', examples: ['SIGUSD'] },
            amount: { type: 'number', examples: [0.01] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: {
          200: {
            properties: {
              ...GetSwapQuoteResponse.properties,
            },
          },
        },
      },
    },
    async (request) => {
      try {
        if (request.query.network != 'mainnet') {
          logger.error(
            `Wrong network, network ${request.query.network} is not supported`,
          );
          throw fastify.httpErrors.internalServerError(
            `Wrong network, network ${request.query.network} is not supported`,
          );
        }
        let config = getErgoConfig(request.query.network);
        const chain = Ergo.getInstance(request.query.network);
        const spectrum = Spectrum.getInstance('ergo', request.query.network);

        let result = await spectrum.estimateTrade({
          network: request.query.network,
          chain: 'ergo',
          connector: 'spectrum',
          allowedSlippage: String(request.query.slippagePct),
          amount: String(request.query.amount),
          side: request.query.side as 'BUY' | 'SELL',
          quote: request.query.quoteToken,
          base: request.query.baseToken,
        });

        return {
          estimatedAmountIn: Number(result.amount),
          estimatedAmountOut: Number(result.expectedAmount),
          minAmountOut: Number(result.expectedAmount),
          maxAmountIn: Number(result.amount),
          baseTokenBalanceChange:
            request.query.side == 'SELL'
              ? -request.query.amount
              : request.query.amount,
          quoteTokenBalanceChange:
            request.query.side == 'SELL'
              ? request.query.amount
              : -request.query.amount,
          price: Number(result.price),
          gasPrice: chain.calculateGas(config.network.minTxFee),
          gasLimit: SpectrumConfig.config.gasLimitEstimate,
          gasCost: chain.calculateGas(config.network.minTxFee),
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default spectrumRoutes;

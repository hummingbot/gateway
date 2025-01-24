import type { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { Meteora } from './meteora';
import { wrapResponse } from '../../services/response-wrapper';
import { positionsOwnedRoute } from './routes/positionsOwned';
import { activeBinRoute } from './routes/activeBin';
import { quoteSwapRoute } from './routes/quoteSwap';
import {
  GetFeesQuoteRequestSchema,
  GetFeesQuoteResponseSchema,
  GetLbPairsRequestSchema,
  GetLbPairsResponseSchema,
  // Types
  GetFeesQuoteRequest,
  GetFeesQuoteResponse,
  GetLbPairsRequest,
  GetLbPairsResponse,
} from './meteora.schemas';
import { PublicKey } from '@solana/web3.js';
import sensible from '@fastify/sensible';

declare module 'fastify' {
  interface FastifySchema {
    swaggerQueryExample?: Record<string, unknown>;
    'x-examples'?: Record<string, unknown>;
  }
}

export const meteoraRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);
  
  await fastify.register(positionsOwnedRoute);
  await fastify.register(activeBinRoute);
  await fastify.register(quoteSwapRoute);

  // GET /meteora/lb-pairs
  fastify.get<{ Querystring: GetLbPairsRequest; Reply: GetLbPairsResponse[] }>(
    '/lb-pairs',
    {
      schema: {
        description: 'Get all Meteora LB pairs',
        tags: ['meteora'],
        querystring: GetLbPairsRequestSchema,
        response: {
          200: Type.Array(GetLbPairsResponseSchema)
        },
        swaggerQueryExample: {
          network: 'mainnet-beta'
        }
      }
    },
    async (request) => {
      const { network } = request.query;
      const meteora = await Meteora.getInstance(network);
      const initTime = Date.now();
      const pairs = meteora.getLbPairs();
      return wrapResponse(pairs, initTime);
    }
  );

  // GET /meteora/quote-fees/:positionAddress
  fastify.get<{ Params: { positionAddress: string }; Querystring: GetFeesQuoteRequest; Reply: GetFeesQuoteResponse }>(
    '/quote-fees/:positionAddress',
    {
      schema: {
        description: 'Get the fees quote for a Meteora position',
        tags: ['meteora'],
        querystring: GetFeesQuoteRequestSchema,
        response: {
          200: GetFeesQuoteResponseSchema
        },
        swaggerQueryExample: {
          network: 'mainnet-beta'
        }
      }
    },
    async (request) => {
      const { network } = request.query;
      const { positionAddress } = request.params;
      const meteora = await Meteora.getInstance(network);
      return meteora.getFeesQuote(network, new PublicKey(positionAddress));
    }
  );
};

export default meteoraRoutes; 
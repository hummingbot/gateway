import type { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { Solana } from '../../chains/solana/solana';
import { Meteora } from './meteora';
import { wrapResponse } from '../../services/response-wrapper';
import { positionsOwnedRoute } from './routes/positionsOwned';
import { activeBinRoute } from './routes/activeBin';
import {
  GetSwapQuoteRequestSchema,
  GetSwapQuoteResponseSchema,
  GetFeesQuoteRequestSchema,
  GetFeesQuoteResponseSchema,
  GetLbPairsRequestSchema,
  GetLbPairsResponseSchema,
  // Types
  GetSwapQuoteRequest,
  GetSwapQuoteResponse,
  GetFeesQuoteRequest,
  GetFeesQuoteResponse,
  GetLbPairsRequest,
  GetLbPairsResponse,
} from './meteora.schemas';
import { PublicKey } from '@solana/web3.js';

declare module 'fastify' {
  interface FastifySchema {
    swaggerQueryExample?: Record<string, unknown>;
    'x-examples'?: Record<string, unknown>;
  }
}

export const meteoraRoutes: FastifyPluginAsync = async (fastify) => {
  // Register the positions owned route
  await fastify.register(positionsOwnedRoute);
  
  // Register the active bin route
  await fastify.register(activeBinRoute);

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
      const meteora = Meteora.getInstance(network);
      const initTime = Date.now();
      const pairs = await meteora.getLbPairs();
      return wrapResponse(pairs, initTime);
    }
  );

  // GET /meteora/quote-swap
  fastify.get<{ Querystring: GetSwapQuoteRequest; Reply: GetSwapQuoteResponse }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get a swap quote for Meteora',
        tags: ['meteora'],
        querystring: GetSwapQuoteRequestSchema,
        response: {
          200: GetSwapQuoteResponseSchema
        },
        swaggerQueryExample: {
          network: 'mainnet-beta',
          inputTokenSymbol: 'SOL',
          outputTokenSymbol: 'USDC',
          amount: 1,
          poolAddress: 'FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz'
        }
      }
    },
    async (request) => {
      const { network, inputTokenSymbol, outputTokenSymbol, amount, poolAddress, slippagePct } = request.query;
      const solana = Solana.getInstance(network);
      const meteora = Meteora.getInstance(network);
      return await meteora.getSwapQuote(solana, inputTokenSymbol, outputTokenSymbol, amount, poolAddress, slippagePct);
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
      const meteora = Meteora.getInstance(network);
      return await meteora.getFeesQuote(network, new PublicKey(positionAddress));
    }
  );
};

export default meteoraRoutes; 
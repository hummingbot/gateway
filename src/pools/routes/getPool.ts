import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { PoolService } from '../../services/pool-service';
import { PoolListResponseSchema } from '../schemas';

export const getPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { tradingPair: string };
    Querystring: {
      connector: string;
      network: string;
      type: 'amm' | 'clmm';
    };
  }>(
    '/:tradingPair',
    {
      schema: {
        description: 'Get a specific pool by trading pair',
        tags: ['/pools'],
        params: {
          type: 'object',
          properties: {
            tradingPair: {
              type: 'string',
              description: 'Trading pair (e.g., ETH-USDC, SOL-USDC)',
              examples: ['ETH-USDC', 'SOL-USDC'],
            },
          },
          required: ['tradingPair'],
        },
        querystring: Type.Object({
          connector: Type.String({
            description: 'Connector (raydium, meteora, uniswap)',
            examples: ['raydium', 'meteora', 'uniswap'],
          }),
          network: Type.String({
            description: 'Network name (mainnet, mainnet-beta, etc)',
            examples: ['mainnet', 'mainnet-beta'],
          }),
          type: Type.Union([Type.Literal('amm'), Type.Literal('clmm')], {
            description: 'Pool type',
            examples: ['amm', 'clmm'],
          }),
        }),
        response: {
          200: PoolListResponseSchema.items,
          404: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request) => {
      const { tradingPair } = request.params;
      const { connector, network, type } = request.query;
      const poolService = PoolService.getInstance();

      try {
        // Parse trading pair (e.g., "ETH-USDC" -> ["ETH", "USDC"])
        const [baseToken, quoteToken] = tradingPair.split('-');

        if (!baseToken || !quoteToken) {
          throw new Error('Invalid trading pair format. Expected: BASE-QUOTE (e.g., ETH-USDC)');
        }

        const pool = await poolService.getPool(connector, network, type, baseToken, quoteToken);

        if (!pool) {
          throw fastify.httpErrors.notFound(`Pool for ${tradingPair} not found in ${connector} ${type} on ${network}`);
        }

        return pool;
      } catch (error) {
        if (error.statusCode === 404) {
          throw error;
        }
        throw fastify.httpErrors.badRequest(error.message);
      }
    },
  );
};

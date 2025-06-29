import { FastifyPluginAsync } from 'fastify';

import { PoolService } from '../../services/pool-service';
import { PoolGetRequestSchema, PoolListResponseSchema } from '../schemas';
import { PoolGetRequest } from '../types';

export const getPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: PoolGetRequest }>(
    '/find',
    {
      schema: {
        description: 'Get a specific pool by token pair',
        tags: ['pools'],
        querystring: PoolGetRequestSchema,
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
      const { connector, network, type, tokenPair } = request.query;
      const poolService = PoolService.getInstance();

      try {
        // Parse token pair (e.g., "ETH-USDC" -> ["ETH", "USDC"])
        const [baseToken, quoteToken] = tokenPair.split('-');
        
        if (!baseToken || !quoteToken) {
          throw new Error('Invalid token pair format. Expected: BASE-QUOTE (e.g., ETH-USDC)');
        }

        const pool = await poolService.getPool(connector, network, type, baseToken, quoteToken);
        
        if (!pool) {
          throw fastify.httpErrors.notFound(
            `Pool for ${tokenPair} not found in ${connector} ${type} on ${network}`,
          );
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
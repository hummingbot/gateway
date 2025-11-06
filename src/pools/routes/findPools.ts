import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import { findPools } from '../pool-finder';
import { FindPoolsQuery, FindPoolsQuerySchema, FindPoolsResponse, FindPoolsResponseSchema } from '../schemas';

export const findPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: FindPoolsQuery;
    Reply: FindPoolsResponse;
  }>(
    '/find',
    {
      schema: {
        description: 'Find pools for a token pair from GeckoTerminal',
        tags: ['/pools'],
        querystring: FindPoolsQuerySchema,
        response: {
          200: FindPoolsResponseSchema,
        },
      },
    },
    async (request) => {
      const { tokenA, tokenB, chainNetwork, page = 3, connector, type = 'clmm' } = request.query;

      try {
        const pools = await findPools(chainNetwork, {
          tokenA,
          tokenB,
          connector,
          type: type as 'amm' | 'clmm',
          page,
        });

        return pools;
      } catch (error: any) {
        logger.error(`Failed to find pools: ${error.message}`);

        // Re-throw if it's already an HTTP error
        if (error.statusCode) {
          throw error;
        }

        if (error.message.includes('Unsupported network')) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        if (error.message.includes('Invalid chainNetwork') || error.message.includes('Unsupported chainNetwork')) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        throw fastify.httpErrors.internalServerError('Failed to fetch pools from GeckoTerminal');
      }
    },
  );
};

export default findPoolsRoute;

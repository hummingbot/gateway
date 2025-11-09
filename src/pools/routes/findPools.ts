import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import { findPools } from '../pool-finder';
import { fetchDetailedPoolInfo } from '../pool-lookup-helper';
import {
  FindPoolsQuery,
  FindPoolsQuerySchema,
  FindPoolsResponse,
  FindPoolsResponseSchema,
  PoolInfoSchema,
} from '../schemas';

export const findPoolsRoute: FastifyPluginAsync = async (fastify) => {
  // GET /pools/find/:address - Get detailed pool info by address
  fastify.get<{
    Params: { address: string };
    Querystring: { chainNetwork: string };
    Reply: typeof PoolInfoSchema.static;
  }>(
    '/find/:address',
    {
      schema: {
        description: 'Get detailed pool information by address from GeckoTerminal',
        tags: ['/pools'],
        params: {
          type: 'object',
          properties: {
            address: {
              type: 'string',
              description: 'Pool contract address',
              examples: ['58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2', '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640'],
            },
          },
          required: ['address'],
        },
        querystring: Type.Object({
          chainNetwork: FindPoolsQuerySchema.properties.chainNetwork,
        }),
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { chainNetwork } = request.query;

      try {
        // Fetch detailed pool information using shared helper
        const { poolData } = await fetchDetailedPoolInfo(chainNetwork, address);

        // Return pool data in PoolInfo format (same as what's returned from find pools)
        return poolData;
      } catch (error: any) {
        logger.error(`Failed to get pool info for ${address}: ${error.message}`);

        // Re-throw if it's already an HTTP error
        if (error.statusCode) {
          throw error;
        }

        if (error.message.includes('not found')) {
          throw fastify.httpErrors.notFound(error.message);
        }

        if (error.message.includes('Unsupported network') || error.message.includes('Unsupported chainNetwork')) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        if (error.message.includes('no connector/type mapping')) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        if (error.message.includes('Unable to fetch pool-info')) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        if (error.message.includes('Could not resolve symbols')) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        throw fastify.httpErrors.internalServerError('Failed to fetch pool info from GeckoTerminal');
      }
    },
  );

  // GET /pools/find - Search for pools by token pair
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
      const { tokenA, tokenB, chainNetwork, pages = 10, connector, type = 'clmm' } = request.query;

      try {
        const pools = await findPools(chainNetwork, {
          tokenA,
          tokenB,
          connector,
          type: type as 'amm' | 'clmm',
          page: pages,
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

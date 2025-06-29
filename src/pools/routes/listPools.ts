import { FastifyPluginAsync } from 'fastify';

import { PoolService } from '../../services/pool-service';
import { PoolListRequestSchema, PoolListResponseSchema } from '../schemas';
import { PoolListRequest } from '../types';

export const listPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: PoolListRequest }>(
    '/',
    {
      schema: {
        description:
          'List all pools for a connector, optionally filtered by network, type, or search term',
        tags: ['pools'],
        querystring: PoolListRequestSchema,
        response: {
          200: PoolListResponseSchema,
        },
      },
    },
    async (request) => {
      const { connector, network, type, search } = request.query;
      const poolService = PoolService.getInstance();

      try {
        const pools = await poolService.listPools(
          connector,
          network,
          type,
          search,
        );
        return pools;
      } catch (error) {
        throw fastify.httpErrors.badRequest(error.message);
      }
    },
  );
};

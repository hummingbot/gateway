import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { logger } from '../../services/logger';
import { getDefaultPools } from '../utils';
import { PoolsQuery, PoolsQuerySchema, DefaultPoolListSchema } from '../schemas';

export const getPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: PoolsQuery;
    Reply: Record<string, string>;
  }>(
    '/pools',
    {
      schema: {
        description: 'Get default pools for a specific connector',
        tags: ['config'],
        querystring: PoolsQuerySchema,
        response: {
          200: Type.Record(
            Type.String({
              pattern: '^[A-Z]+-[A-Z]+$'
            }),
            Type.String()
          )
        }
      }
    },
    async (request) => {
      const { connector } = request.query;
      return getDefaultPools(fastify, connector);
    }
  );
};

export default getPoolsRoute;
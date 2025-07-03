import { FastifyPluginAsync } from 'fastify';

import { PoolService } from '../../services/pool-service';
import { PoolAddRequestSchema, PoolSuccessResponseSchema } from '../schemas';
import { PoolAddRequest, Pool } from '../types';

export const addPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: PoolAddRequest }>(
    '/',
    {
      schema: {
        description: 'Add a new pool',
        tags: ['/pools'],
        body: PoolAddRequestSchema,
        response: {
          200: PoolSuccessResponseSchema,
          400: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request) => {
      const { connector, type, network, baseSymbol, quoteSymbol, address } =
        request.body;

      const poolService = PoolService.getInstance();

      try {
        const pool: Pool = {
          type,
          network,
          baseSymbol,
          quoteSymbol,
          address,
        };

        await poolService.addPool(connector, pool);

        return {
          message: `Pool ${baseSymbol}-${quoteSymbol} added successfully to ${connector} ${type} on ${network}`,
        };
      } catch (error) {
        throw fastify.httpErrors.badRequest(error.message);
      }
    },
  );
};

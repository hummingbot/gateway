import { FastifyPluginAsync } from 'fastify';

import { PoolService } from '../../services/pool-service';
import { PoolRemoveRequestSchema, PoolSuccessResponseSchema } from '../schemas';
import { PoolRemoveRequest } from '../types';

export const removePoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{ Body: PoolRemoveRequest }>(
    '/',
    {
      schema: {
        description: 'Remove a pool by address',
        tags: ['pools'],
        body: PoolRemoveRequestSchema,
        response: {
          200: PoolSuccessResponseSchema,
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
      const { connector, network, type, address } = request.body;
      const poolService = PoolService.getInstance();

      try {
        await poolService.removePool(connector, network, type, address);

        return {
          message: `Pool with address ${address} removed successfully from ${connector} ${type} on ${network}`,
        };
      } catch (error) {
        if (error.message.includes('not found')) {
          throw fastify.httpErrors.notFound(error.message);
        }
        throw fastify.httpErrors.badRequest(error.message);
      }
    },
  );
};
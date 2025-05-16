import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../../services/logger';
import {
  GetPoolInfoRequestType,
  GetPoolInfoRequest,
  PoolInfo,
  PoolInfoSchema,
} from '../../../schemas/trading-types/amm-schema';

const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: '',
        tags: [''],
        querystring: {
          ...GetPoolInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet-beta'] },
            poolAddress: {
              type: 'string',
              examples: [''],
            },
          },
        },
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (_): Promise<PoolInfo> => {
      try {
        throw fastify.httpErrors.internalServerError('Not implemented !');
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError(
          'Failed to fetch pool info',
        );
      }
    },
  );
};

export default poolInfoRoute;
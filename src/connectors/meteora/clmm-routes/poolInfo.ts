import { FastifyPluginAsync } from 'fastify';

import {
  MeteoraPoolInfo,
  MeteoraPoolInfoSchema,
  GetPoolInfoRequestType,
  GetPoolInfoRequest,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: MeteoraPoolInfo;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get pool information for a Meteora pool',
        tags: ['meteora/clmm'],
        querystring: {
          ...GetPoolInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet-beta'] },
            poolAddress: {
              type: 'string',
              examples: ['2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3'],
            },
          },
        },
        response: {
          200: MeteoraPoolInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network;

        const meteora = await Meteora.getInstance(network);
        if (!meteora) {
          throw fastify.httpErrors.serviceUnavailable(
            'Meteora service unavailable',
          );
        }

        return (await meteora.getPoolInfo(poolAddress)) as MeteoraPoolInfo;
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default poolInfoRoute;

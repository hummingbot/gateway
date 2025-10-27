import { FastifyPluginAsync } from 'fastify';

import { getPoolInfo } from '@gateway-sdk/solana/meteora/operations/clmm';

import { MeteoraPoolInfo, MeteoraPoolInfoSchema, GetPoolInfoRequestType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmGetPoolInfoRequest } from '../schemas';

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: MeteoraPoolInfo;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get pool information for a Meteora pool',
        tags: ['/connector/meteora'],
        querystring: MeteoraClmmGetPoolInfoRequest,
        response: {
          200: MeteoraPoolInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const { poolAddress, network } = request.query;

        const meteora = await Meteora.getInstance(network);
        if (!meteora) {
          throw fastify.httpErrors.serviceUnavailable('Meteora service unavailable');
        }

        // Use SDK operation
        const result = await getPoolInfo(meteora, { network, poolAddress });

        return result as MeteoraPoolInfo;
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

import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { MeteoraPoolInfo, MeteoraPoolInfoSchema, GetPoolInfoRequestType, PoolInfo } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmGetPoolInfoRequest } from '../schemas';

export async function getPoolInfo(
  fastify: FastifyInstance,
  network: string,
  poolAddress: string,
): Promise<PoolInfo | MeteoraPoolInfo> {
  const meteora = await Meteora.getInstance(network);
  if (!meteora) {
    throw fastify.httpErrors.serviceUnavailable('Meteora service unavailable');
  }

  if (!poolAddress) {
    throw fastify.httpErrors.badRequest('Pool address is required');
  }

  // Fetch pool info directly from RPC
  const poolInfo = (await meteora.getPoolInfo(poolAddress)) as MeteoraPoolInfo;
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  return poolInfo;
}

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
        const { poolAddress } = request.query;
        const network = request.query.network;
        return (await getPoolInfo(fastify, network, poolAddress)) as MeteoraPoolInfo;
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

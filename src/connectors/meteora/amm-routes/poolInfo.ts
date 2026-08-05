import { FastifyPluginAsync } from 'fastify';

import { GetPoolInfoRequestType, PoolInfo, PoolInfoSchema } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { MeteoraDamm } from '../meteora-damm';
import { MeteoraAmmGetPoolInfoRequest } from '../schemas';

/** Standard AMM pool-info entry point (network-based) — consumed by the unified /trading/amm dispatcher. */
export async function getPoolInfo(network: string, poolAddress: string): Promise<PoolInfo> {
  const meteoraDamm = await MeteoraDamm.getInstance(network);
  return await meteoraDamm.getPoolInfo(poolAddress);
}

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: PoolInfo;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get AMM pool information from Meteora DAMM v2',
        tags: ['/connector/meteora'],
        querystring: MeteoraAmmGetPoolInfoRequest,
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress, network } = request.query;
        return await getPoolInfo(network, poolAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    },
  );
};

export default poolInfoRoute;

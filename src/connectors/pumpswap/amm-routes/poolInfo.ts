import { FastifyPluginAsync } from 'fastify';

import { GetPoolInfoRequestType, PoolInfo, PoolInfoSchema } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Pumpswap } from '../pumpswap';
import { PumpswapAmmGetPoolInfoRequest } from '../schemas';

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get AMM pool information from Pumpswap',
        tags: ['/connector/pumpswap'],
        querystring: PumpswapAmmGetPoolInfoRequest,
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network;

        const pumpswap = await Pumpswap.getInstance(network);

        const poolInfo = await pumpswap.getAmmPoolInfo(poolAddress);
        if (!poolInfo) throw fastify.httpErrors.notFound('Pool not found');

        return poolInfo;
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    },
  );
};

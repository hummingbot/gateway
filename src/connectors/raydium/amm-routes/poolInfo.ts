import { FastifyPluginAsync } from 'fastify';

import { GetPoolInfoRequestType, PoolInfo, PoolInfoSchema } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumAmmGetPoolInfoRequest } from '../schemas';

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get AMM pool information from Raydium',
        tags: ['/connector/raydium'],
        querystring: RaydiumAmmGetPoolInfoRequest,
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network;

        const raydium = await Raydium.getInstance(network);

        const poolInfo = await raydium.getAmmPoolInfo(poolAddress);
        if (!poolInfo) throw fastify.httpErrors.notFound('Pool not found');

        // Return only the fields defined in the schema
        const { poolType, ...basePoolInfo } = poolInfo;
        return basePoolInfo;
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    },
  );
};

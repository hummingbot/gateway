import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { GetPoolInfoRequestType, PoolInfo, PoolInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumClmmGetPoolInfoRequest } from '../schemas';

export async function getPoolInfo(fastify: FastifyInstance, network: string, poolAddress: string): Promise<PoolInfo> {
  const raydium = await Raydium.getInstance(network);
  const poolInfo = await raydium.getClmmPoolInfo(poolAddress);
  if (!poolInfo) throw fastify.httpErrors.notFound('Pool not found');
  return poolInfo;
}

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get CLMM pool information from Raydium',
        tags: ['/connector/raydium'],
        querystring: RaydiumClmmGetPoolInfoRequest,
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network;
        return await getPoolInfo(fastify, network, poolAddress);
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    },
  );
};

export default poolInfoRoute;

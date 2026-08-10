import { FastifyPluginAsync } from 'fastify';

import { GetPoolInfoRequestType, PoolInfo, PoolInfoSchema } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumAmmGetPoolInfoRequest } from '../schemas';

/**
 * Standardized network-first pool-info fetcher for the Raydium AMM/CPMM connector.
 * Imported by the unified /trading/amm dispatcher and by the Fastify route below.
 */
export async function getPoolInfo(network: string, poolAddress: string): Promise<PoolInfo> {
  const raydium = await Raydium.getInstance(network);

  const poolInfo = await raydium.getAmmPoolInfo(poolAddress);
  if (!poolInfo) throw httpErrors.notFound('Pool not found');

  // Return only the fields defined in the schema
  const { poolType, ...basePoolInfo } = poolInfo;
  return basePoolInfo;
}

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
        const { poolAddress, network } = request.query;
        return await getPoolInfo(network, poolAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw httpErrors.internalServerError('Failed to fetch pool info');
      }
    },
  );
};

export default poolInfoRoute;

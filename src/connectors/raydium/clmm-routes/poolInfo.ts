import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { GetPoolInfoRequestType, PoolInfo, PoolInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumClmmGetPoolInfoRequest } from '../schemas';

export async function getPoolInfo(fastify: FastifyInstance, network: string, poolAddress: string): Promise<PoolInfo> {
  const raydium = await Raydium.getInstance(network);

  if (!poolAddress) {
    throw fastify.httpErrors.badRequest('Pool address is required');
  }

  // Check cache first
  const solana = await Solana.getInstance(network);
  const poolCache = solana.getPoolCache();

  if (poolCache) {
    const cached = poolCache.get(poolAddress);
    if (cached) {
      logger.debug(`[pool-cache] HIT for ${poolAddress}`);
      // Check if stale and trigger background refresh
      if (poolCache.isStale(poolAddress)) {
        logger.debug(`[pool-cache] STALE for ${poolAddress}, triggering background refresh`);
        // Non-blocking refresh
        raydium
          .getClmmPoolInfo(poolAddress)
          .then((freshPoolInfo) => {
            if (freshPoolInfo) {
              poolCache.set(poolAddress, { poolInfo: freshPoolInfo });
              logger.debug(`[pool-cache] Background refresh completed for ${poolAddress}`);
            }
          })
          .catch((err) => logger.warn(`Background pool refresh failed for ${poolAddress}: ${err.message}`));
      }
      return cached.poolInfo as PoolInfo;
    }
    logger.debug(`[pool-cache] MISS for ${poolAddress}`);
  }

  // Cache miss or disabled - fetch from RPC
  const poolInfo = await raydium.getClmmPoolInfo(poolAddress);
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  // Populate cache for future requests
  if (poolCache) {
    poolCache.set(poolAddress, { poolInfo });
    logger.debug(`[pool-cache] SET for ${poolAddress}`);
  }

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

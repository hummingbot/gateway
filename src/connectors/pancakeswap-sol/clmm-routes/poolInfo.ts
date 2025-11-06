import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { GetPoolInfoRequestType, PoolInfo, PoolInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import { PancakeswapSolClmmGetPoolInfoRequest } from '../schemas';

export async function getPoolInfo(fastify: FastifyInstance, network: string, poolAddress: string): Promise<PoolInfo> {
  const pancakeswap = await PancakeswapSol.getInstance(network);

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
        pancakeswap
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
  const poolInfo = await pancakeswap.getClmmPoolInfo(poolAddress);
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
    Reply: PoolInfo;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get CLMM pool information from PancakeSwap Solana',
        tags: ['/connector/pancakeswap-sol'],
        querystring: PancakeswapSolClmmGetPoolInfoRequest,
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { network = 'mainnet-beta', poolAddress } = request.query;
        return await getPoolInfo(fastify, network, poolAddress);
      } catch (e: any) {
        logger.error('Pool info error:', e);
        // Re-throw httpErrors as-is
        if (e.statusCode) {
          throw e;
        }
        // Handle unknown errors
        const errorMessage = e.message || 'Failed to fetch pool info';
        throw fastify.httpErrors.internalServerError(errorMessage);
      }
    },
  );
};

export default poolInfoRoute;

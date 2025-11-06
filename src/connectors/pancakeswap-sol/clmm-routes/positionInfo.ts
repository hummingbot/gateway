import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { GetPositionInfoRequestType, PositionInfo, PositionInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import { PancakeswapSolClmmGetPositionInfoRequest } from '../schemas';

export async function getPositionInfo(
  fastify: FastifyInstance,
  network: string,
  positionAddress: string,
): Promise<PositionInfo> {
  const pancakeswap = await PancakeswapSol.getInstance(network);

  if (!positionAddress) {
    throw fastify.httpErrors.badRequest('Position address is required');
  }

  // Check cache first
  const solana = await Solana.getInstance(network);
  const positionCache = solana.getPositionCache();

  if (positionCache) {
    const cacheKey = `pancakeswap-sol:clmm:${positionAddress}`;
    const cached = positionCache.get(cacheKey);
    if (cached && cached.positions.length > 0) {
      const position = cached.positions[0]; // Single position stored under this key
      logger.debug(`[position-cache] HIT for ${positionAddress}`);
      // Check if stale and trigger background refresh
      if (positionCache.isStale(cacheKey)) {
        logger.debug(`[position-cache] STALE for ${positionAddress}, triggering background refresh`);
        // Non-blocking refresh
        pancakeswap
          .getPositionInfo(positionAddress)
          .then((freshPositionInfo) => {
            if (freshPositionInfo) {
              positionCache.set(cacheKey, {
                positions: [
                  {
                    // Metadata fields for cache management (required by PositionData interface)
                    connector: 'pancakeswap-sol',
                    positionId: positionAddress,
                    poolAddress: freshPositionInfo.poolAddress,
                    baseToken: freshPositionInfo.baseTokenAddress,
                    quoteToken: freshPositionInfo.quoteTokenAddress,
                    liquidity: freshPositionInfo.baseTokenAmount + freshPositionInfo.quoteTokenAmount,
                    // Spread all PositionInfo fields
                    ...freshPositionInfo,
                  },
                ],
              });
              logger.debug(`[position-cache] Background refresh completed for ${positionAddress}`);
            }
          })
          .catch((err) => logger.warn(`Background position refresh failed for ${positionAddress}: ${err.message}`));
      }
      // Extract PositionInfo from cached position data
      // Remove only the metadata fields that are NOT part of PositionInfo
      // Keep: poolAddress (part of PositionInfo), baseTokenAddress, quoteTokenAddress (from ...positionInfo)
      // Remove: connector, positionId, baseToken, quoteToken (metadata only), liquidity
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { connector, positionId, baseToken, quoteToken, liquidity, ...positionInfo } = position;
      return positionInfo as PositionInfo;
    }
    logger.debug(`[position-cache] MISS for ${positionAddress}`);
  }

  // Cache miss or disabled - fetch from RPC
  const positionInfo = await pancakeswap.getPositionInfo(positionAddress);
  if (!positionInfo) {
    throw fastify.httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  // Populate cache for future requests
  if (positionCache) {
    const cacheKey = `pancakeswap-sol:clmm:${positionAddress}`;
    positionCache.set(cacheKey, {
      positions: [
        {
          // Metadata fields for cache management (required by PositionData interface)
          connector: 'pancakeswap-sol',
          positionId: positionAddress,
          poolAddress: positionInfo.poolAddress,
          baseToken: positionInfo.baseTokenAddress,
          quoteToken: positionInfo.quoteTokenAddress,
          liquidity: positionInfo.baseTokenAmount + positionInfo.quoteTokenAmount,
          // Spread all PositionInfo fields
          ...positionInfo,
        },
      ],
    });
    logger.debug(`[position-cache] SET for ${positionAddress}`);
  }

  return positionInfo;
}

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPositionInfoRequestType;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get CLMM position information from PancakeSwap Solana',
        tags: ['/connector/pancakeswap-sol'],
        querystring: PancakeswapSolClmmGetPositionInfoRequest,
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request): Promise<PositionInfo> => {
      try {
        const { network = 'mainnet-beta', positionAddress } = request.query;
        return await getPositionInfo(fastify, network, positionAddress);
      } catch (e: any) {
        logger.error('Position info error:', e);
        // Re-throw httpErrors as-is
        if (e.statusCode) {
          throw e;
        }
        // Handle unknown errors
        const errorMessage = e.message || 'Failed to fetch position info';
        throw fastify.httpErrors.internalServerError(errorMessage);
      }
    },
  );
};

export default positionInfoRoute;

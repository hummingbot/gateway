import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { PositionInfo, PositionInfoSchema, GetPositionInfoRequestType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmGetPositionInfoRequest } from '../schemas';

export async function getPositionInfo(
  fastify: FastifyInstance,
  network: string,
  positionAddress: string,
): Promise<PositionInfo> {
  const meteora = await Meteora.getInstance(network);

  if (!positionAddress) {
    throw fastify.httpErrors.badRequest('Position address is required');
  }

  // Check cache first
  const { Solana } = await import('../../../chains/solana/solana');
  const solana = await Solana.getInstance(network);
  const positionCache = solana.getPositionCache();

  if (positionCache) {
    const cached = positionCache.get(positionAddress);
    if (cached && cached.positions.length > 0) {
      const position = cached.positions[0]; // Single position stored under this key
      logger.debug(`[position-cache] HIT for ${positionAddress}`);
      // Check if stale and trigger background refresh
      if (positionCache.isStale(positionAddress)) {
        logger.debug(`[position-cache] STALE for ${positionAddress}, triggering background refresh`);
        // Non-blocking refresh
        meteora
          .getPositionInfoByAddress(positionAddress)
          .then((freshPositionInfo) => {
            if (freshPositionInfo) {
              positionCache.set(positionAddress, {
                positions: [
                  {
                    // Metadata fields for cache management (required by PositionData interface)
                    connector: 'meteora',
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { connector, positionId, baseToken, quoteToken, liquidity, ...positionInfo } = position;
      return positionInfo as PositionInfo;
    }
    logger.debug(`[position-cache] MISS for ${positionAddress}`);
  }

  // Cache miss or disabled - fetch from RPC
  const positionInfo = await meteora.getPositionInfoByAddress(positionAddress);
  if (!positionInfo) {
    throw fastify.httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  // Populate cache for future requests
  if (positionCache) {
    positionCache.set(positionAddress, {
      positions: [
        {
          // Metadata fields for cache management (required by PositionData interface)
          connector: 'meteora',
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
        description: 'Get details for a specific Meteora position',
        tags: ['/connector/meteora'],
        querystring: MeteoraClmmGetPositionInfoRequest,
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const { positionAddress } = request.query;
        const network = request.query.network;
        return await getPositionInfo(fastify, network, positionAddress);
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

export default positionInfoRoute;

import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { PositionInfo, PositionInfoSchema, GetPositionInfoRequestType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumClmmGetPositionInfoRequest } from '../schemas';

export async function getPositionInfo(
  fastify: FastifyInstance,
  network: string,
  positionAddress: string,
): Promise<PositionInfo> {
  const raydium = await Raydium.getInstance(network);

  if (!positionAddress) {
    throw fastify.httpErrors.badRequest('Position address is required');
  }

  // Check cache first
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
        raydium
          .getPositionInfo(positionAddress)
          .then((freshPositionInfo) => {
            if (freshPositionInfo) {
              positionCache.set(positionAddress, {
                positions: [
                  {
                    // Metadata fields for cache management (required by PositionData interface)
                    connector: 'raydium',
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
  const positionInfo = await raydium.getPositionInfo(positionAddress);
  if (!positionInfo) {
    throw fastify.httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  // Populate cache for future requests
  if (positionCache) {
    positionCache.set(positionAddress, {
      positions: [
        {
          // Metadata fields for cache management (required by PositionData interface)
          connector: 'raydium',
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
        description: 'Get info about a Raydium CLMM position',
        tags: ['/connector/raydium'],
        querystring: RaydiumClmmGetPositionInfoRequest,
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request) => {
      const { network = 'mainnet-beta', positionAddress } = request.query;
      return await getPositionInfo(fastify, network, positionAddress);
    },
  );
};

export default positionInfoRoute;

import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { MeteoraPoolInfo, MeteoraPoolInfoSchema, GetPoolInfoRequestType, PoolInfo } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmGetPoolInfoRequest } from '../schemas';

export async function getPoolInfo(
  fastify: FastifyInstance,
  network: string,
  poolAddress: string,
): Promise<PoolInfo | MeteoraPoolInfo> {
  const meteora = await Meteora.getInstance(network);
  if (!meteora) {
    throw fastify.httpErrors.serviceUnavailable('Meteora service unavailable');
  }

  if (!poolAddress) {
    throw fastify.httpErrors.badRequest('Pool address is required');
  }

  // Check cache first
  const { Solana } = await import('../../../chains/solana/solana');
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
        meteora
          .getPoolInfo(poolAddress)
          .then((freshPoolInfo) => {
            if (freshPoolInfo) {
              poolCache.set(poolAddress, { poolInfo: freshPoolInfo });
              logger.debug(`[pool-cache] Background refresh completed for ${poolAddress}`);
            }
          })
          .catch((err) => logger.warn(`Background pool refresh failed for ${poolAddress}: ${err.message}`));
      }
      return cached.poolInfo as MeteoraPoolInfo;
    }
    logger.debug(`[pool-cache] MISS for ${poolAddress}`);
  }

  // Cache miss or disabled - fetch from RPC
  const poolInfo = (await meteora.getPoolInfo(poolAddress)) as MeteoraPoolInfo;
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
    Reply: MeteoraPoolInfo;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get pool information for a Meteora pool',
        tags: ['/connector/meteora'],
        querystring: MeteoraClmmGetPoolInfoRequest,
        response: {
          200: MeteoraPoolInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network;
        return (await getPoolInfo(fastify, network, poolAddress)) as MeteoraPoolInfo;
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );

  // Server-Sent Events streaming endpoint for real-time pool updates
  fastify.get<{
    Querystring: { network: string; poolAddress: string };
  }>(
    '/pool-info-stream',
    {
      schema: {
        description: 'Stream real-time pool info updates via Server-Sent Events',
        tags: ['/connector/meteora'],
        querystring: Type.Object({
          network: Type.String({ description: 'Solana network name (e.g., mainnet-beta, devnet)' }),
          poolAddress: Type.String({ description: 'Pool address to monitor' }),
        }),
        response: {
          200: Type.Object(
            {
              subscriptionId: Type.Number(),
              message: Type.String(),
            },
            { description: 'Subscription confirmation (sent as first event)' },
          ),
        },
      },
    },
    async (request, reply) => {
      try {
        const { network, poolAddress } = request.query;

        // Set headers for Server-Sent Events
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

        const meteora = await Meteora.getInstance(network);

        // Subscribe to pool updates
        const subscriptionId = await meteora.subscribeToPoolUpdates(poolAddress, (poolInfo) => {
          // Send pool update as SSE event
          const eventData = JSON.stringify(poolInfo);
          reply.raw.write(`data: ${eventData}\n\n`);
        });

        // Send initial confirmation message
        const confirmationData = JSON.stringify({
          subscriptionId,
          message: `Subscribed to pool updates for ${poolAddress}`,
        });
        reply.raw.write(`data: ${confirmationData}\n\n`);

        logger.info(`Client connected to pool stream: ${poolAddress} (subscription ID: ${subscriptionId})`);

        // Cleanup on disconnect
        request.raw.on('close', async () => {
          try {
            await meteora.unsubscribeFromPool(subscriptionId);
            logger.info(`Client disconnected from pool stream: ${poolAddress} (subscription ID: ${subscriptionId})`);
          } catch (error: any) {
            logger.error(`Error unsubscribing from pool ${poolAddress}: ${error.message}`);
          }
        });

        // Keep connection alive
        const keepAliveInterval = setInterval(() => {
          reply.raw.write(': keepalive\n\n');
        }, 30000); // Send keepalive every 30 seconds

        request.raw.on('close', () => {
          clearInterval(keepAliveInterval);
        });
      } catch (e: any) {
        logger.error('Pool info stream error:', {
          message: e.message || 'Unknown error',
          name: e.name,
          code: e.code,
          statusCode: e.statusCode,
          stack: e.stack,
          poolAddress: request.query.poolAddress,
          network: request.query.network,
        });

        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, e.message);
        }
        throw fastify.httpErrors.internalServerError('Failed to stream pool updates');
      }
    },
  );
};

export default poolInfoRoute;

import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { GetPoolInfoRequestType, PoolInfo, PoolInfoSchema } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { getPoolInfo } from '../../../../packages/sdk/src/solana/raydium/operations/amm/pool-info';
import { Raydium } from '../raydium';
import { RaydiumAmmGetPoolInfoRequest } from '../schemas';

/**
 * AMM Pool Info Route (SDK-backed)
 *
 * Thin HTTP wrapper around the SDK poolInfo query function.
 * All business logic has been extracted to the SDK layer.
 */
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

        // Get chain and connector instances
        const solana = await Solana.getInstance(network);
        const raydium = await Raydium.getInstance(network);

        // Call SDK function
        const result = await getPoolInfo(raydium, solana, {
          network,
          poolAddress,
        });

        // Transform SDK result to match existing API schema
        // Note: Old API returned InternalAmmPoolInfo, SDK returns richer PoolInfoResult
        // For backward compatibility, we map to the old format
        const poolInfo = await raydium.getAmmPoolInfo(poolAddress);
        if (!poolInfo) throw fastify.httpErrors.notFound('Pool not found');

        // Return only the fields defined in the schema (for now, keep compatibility)
        const { poolType, ...basePoolInfo } = poolInfo;
        return basePoolInfo;
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    },
  );
};

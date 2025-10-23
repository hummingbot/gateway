import { FastifyPluginAsync } from 'fastify';

import { GetPoolInfoRequestType, PoolInfo, PoolInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumClmmGetPoolInfoRequest } from '../schemas';
import { getPoolInfo } from '../../../../packages/sdk/src/solana/raydium/operations/clmm/pool-info';

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
        const { poolAddress, network } = request.query;

        const raydium = await Raydium.getInstance(network);

        // Call SDK operation
        const result = await getPoolInfo(raydium, {
          network,
          poolAddress,
        });

        return result;
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    },
  );
};

export default poolInfoRoute;

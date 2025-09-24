import { FastifyPluginAsync } from 'fastify';

import { GetPoolInfoRequestType, GetPoolInfoRequest, PoolInfo, PoolInfoSchema } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Sundaeswap } from '../sundaeswap';

export const ammPoolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get AMM pool information from Sundaeswap',
        tags: ['sundaeswap/amm'],
        querystring: {
          ...GetPoolInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet'] },
            poolIdent: {
              type: 'string',
              examples: ['2f36866691fa75a9aab66dec99f7cc2d297ca09e34d9ce68cde04773'],
            },
            baseToken: { type: 'string', examples: ['ADA'] },
            quoteToken: { type: 'string', examples: ['SUNDAE'] },
          },
        },
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress: poolIdent } = request.query;
        const network = request.query.network || 'mainnet';

        const sundaeswap = await Sundaeswap.getInstance(network);

        // Check if either poolIdent or both baseToken and quoteToken are provided
        if (!poolIdent) {
          throw fastify.httpErrors.badRequest('poolIdent is required');
        }

        const poolIdentToUse = poolIdent;
        const poolInfo = await sundaeswap.getAmmPoolInfo(poolIdentToUse);
        if (!poolInfo) throw fastify.httpErrors.notFound('Pool not found');
        return poolInfo;
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    },
  );
};

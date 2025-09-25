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
        tags: ['/connector/sundaeswap/amm'],
        querystring: {
          ...GetPoolInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet'] },
            poolAddress: {
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
        const { poolAddress } = request.query;
        const network = request.query.network || 'mainnet';

        const sundaeswap = await Sundaeswap.getInstance(network);
        // console.log('sundaeswap ', sundaeswap);

        // Check if either poolAddress or both baseToken and quoteToken are provided
        if (!poolAddress) {
          throw fastify.httpErrors.badRequest('poolAddress is required');
        }

        const poolInfo = await sundaeswap.getAmmPoolInfo(poolAddress);
        if (!poolInfo) throw fastify.httpErrors.notFound('Pool not found');
        return poolInfo;
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    },
  );
};

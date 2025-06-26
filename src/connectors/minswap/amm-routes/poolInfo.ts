import { FastifyPluginAsync } from 'fastify';

import {
  GetPoolInfoRequestType,
  GetPoolInfoRequest,
  PoolInfo,
  PoolInfoSchema,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Minswap } from '../minswap';

export const ammPoolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get AMM pool information from Minswap',
        tags: ['minswap/amm'],
        querystring: {
          ...GetPoolInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet'] },
            poolAddress: {
              type: 'string',
              examples: [
                '6aa2153e1ae896a95539c9d62f76cedcdabdcdf144e564b8955f609d660cf6a2',
              ],
            },
            baseToken: { type: 'string', examples: ['ADA'] },
            quoteToken: { type: 'string', examples: ['MIN'] },
          },
        },
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress, baseToken, quoteToken } = request.query;
        const network = request.query.network || 'mainnet';

        const minswap = await Minswap.getInstance(network);

        // Check if either poolAddress or both baseToken and quoteToken are provided
        if (!poolAddress && (!baseToken || !quoteToken)) {
          throw fastify.httpErrors.badRequest(
            'Either poolAddress or both baseToken and quoteToken must be provided',
          );
        }

        let poolAddressToUse = poolAddress;

        // If no pool address provided, find default pool using base and quote tokens
        if (!poolAddressToUse) {
          poolAddressToUse = await minswap.findDefaultPool(
            baseToken,
            quoteToken,
            'amm',
          );
          if (!poolAddressToUse) {
            throw fastify.httpErrors.notFound(
              `No AMM pool found for pair ${baseToken}-${quoteToken}`,
            );
          }
        }

        const poolInfo = await minswap.getAmmPoolInfo(poolAddressToUse);
        if (!poolInfo) throw fastify.httpErrors.notFound('Pool not found');
        return poolInfo;
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError(
          'Failed to fetch pool info',
        );
      }
    },
  );
};

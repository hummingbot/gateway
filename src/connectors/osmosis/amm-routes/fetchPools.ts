import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { PoolInfoSchema, FetchPoolsRequestType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';
import { FetchPoolsRequest, SerializableExtendedPool } from '../osmosis.types';

export async function fetchPools(
  fastify: FastifyInstance,
  request: FetchPoolsRequestType,
  poolType: string,
): Promise<SerializableExtendedPool[]> {
  let networkToUse = request.network ? request.network : 'mainnet';
  const osmosis = await Osmosis.getInstance(networkToUse);
  await osmosis.init();
  networkToUse = osmosis.network;
  logger.info(`Network: ${networkToUse}, Chain ID: ${osmosis.chainName}`);
  const response = await osmosis.controller.fetchPoolsForTokens(osmosis, fastify, request, poolType);
  return response;
}

export const fetchPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: FetchPoolsRequestType;
    Reply: Record<string, any>;
  }>(
    '/fetch-pools',
    {
      schema: {
        description: 'Fetch info about Osmosis pools',
        tags: ['/connector/osmosis/amm'],
        querystring: FetchPoolsRequest,
        response: {
          200: Type.Array(PoolInfoSchema),
        },
      },
    },
    async (request): Promise<SerializableExtendedPool[]> => {
      try {
        const { tokenA, tokenB } = request.query;

        if (!tokenA || !tokenB) {
          throw fastify.httpErrors.badRequest('Both baseToken and quoteToken must be provided');
        }

        return await fetchPools(fastify, request.body, 'amm');
      } catch (e) {
        logger.error(`Error in pool-info route: ${e.message}`);
        if (e.stack) {
          logger.debug(`Stack trace: ${e.stack}`);
        }

        // Return appropriate error based on the error message
        if (e.statusCode) {
          throw e; // Already a formatted Fastify error
        } else if (e.message && e.message.includes('invalid address')) {
          throw fastify.httpErrors.badRequest(`Invalid pool address`);
        } else if (e.message && e.message.includes('not found')) {
          throw fastify.httpErrors.notFound(e.message);
        } else {
          throw fastify.httpErrors.internalServerError(`Failed to fetch pool info: ${e.message}`);
        }
      }
    },
  );
};

export default fetchPoolsRoute;

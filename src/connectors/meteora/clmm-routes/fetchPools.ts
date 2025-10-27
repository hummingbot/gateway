import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { fetchPools } from '@gateway-sdk/solana/meteora/operations/clmm';

import { Solana } from '../../../chains/solana/solana';
import { PoolInfo, PoolInfoSchema, FetchPoolsRequestType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmFetchPoolsRequest } from '../schemas';

export const fetchPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: FetchPoolsRequestType;
    Reply: PoolInfo[];
  }>('/fetch-pools', {
    schema: {
      description: 'Fetch info about Meteora pools',
      tags: ['/connector/meteora'],
      querystring: MeteoraClmmFetchPoolsRequest,
      response: {
        200: Type.Array(PoolInfoSchema),
      },
    },
    handler: async (request, _reply) => {
      try {
        const { network, limit, tokenA, tokenB } = request.query;

        const meteora = await Meteora.getInstance(network);
        const solana = await Solana.getInstance(network);

        // Use SDK operation to get pool summaries
        const result = await fetchPools(meteora, solana, {
          network,
          limit,
          tokenA,
          tokenB,
        });

        // Get full pool info for each pool
        const poolInfos = await Promise.all(
          result.pools.map(async (poolSummary) => {
            try {
              return await meteora.getPoolInfo(poolSummary.publicKey);
            } catch (error) {
              logger.error(`Failed to get pool info for ${poolSummary.publicKey}: ${error.message}`);
              throw fastify.httpErrors.notFound(`Pool not found: ${poolSummary.publicKey}`);
            }
          }),
        );

        return poolInfos.filter(Boolean);
      } catch (e) {
        logger.error('Error in fetch-pools:', e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Error processing the request');
      }
    },
  });
};

export default fetchPoolsRoute;

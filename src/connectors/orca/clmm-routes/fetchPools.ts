import { FastifyPluginAsync } from 'fastify';

import { FetchPoolsResponse } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { OrcaClmmFetchPoolsRequest } from '../schemas';

export const fetchPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: {
      network?: string;
      limit?: number;
      query?: string;
      sortBy?: string;
      sortDirection?: string;
      verifiedOnly?: boolean;
    };
  }>('/fetch-pools', {
    schema: {
      description: 'Fetch Orca pools from API with search and sorting',
      tags: ['/connector/orca'],
      querystring: OrcaClmmFetchPoolsRequest,
      response: {
        200: FetchPoolsResponse,
      },
    },
    handler: async (request, _reply) => {
      try {
        const { network, limit = 50, query, sortBy, sortDirection, verifiedOnly } = request.query;

        const orca = await Orca.getInstance(network);

        const rawPools = await orca.fetchPoolsFromApi({
          limit,
          query,
          sortBy,
          sortDirection,
          verifiedOnly,
        });

        // Map to standardized format (same as Meteora)
        const pools = rawPools.map((pool: any) => ({
          address: pool.address,
          name: `${pool.tokenA?.symbol || '?'}-${pool.tokenB?.symbol || '?'}`,
          baseTokenAddress: pool.tokenMintA,
          baseTokenSymbol: pool.tokenA?.symbol || '',
          quoteTokenAddress: pool.tokenMintB,
          quoteTokenSymbol: pool.tokenB?.symbol || '',
          binStep: pool.tickSpacing,
          baseFee: Number(pool.feeRate) / 10000, // Convert to percentage
          price: Number(pool.price),
          tvl: Number(pool.tvlUsdc) || 0,
          apr: pool.feeApr?.day ? Number(pool.feeApr.day) * 100 : undefined, // Convert to percentage
          apy: pool.totalApr?.day ? Number(pool.totalApr.day) * 100 : undefined,
          volume24h: pool.volume?.day ? Number(pool.volume.day) : undefined,
          fees24h: pool.fees?.day ? Number(pool.fees.day) : undefined,
        }));

        return {
          pools,
          total: pools.length, // Orca API doesn't return total count
          page: 1,
          pageSize: limit,
        };
      } catch (e) {
        logger.error('Error in fetch-pools:', e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Error processing the request');
      }
    },
  });
};

export default fetchPoolsRoute;

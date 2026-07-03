import { FastifyPluginAsync } from 'fastify';

import { FetchPoolsResponse } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora, MeteoraApiPool } from '../meteora';
import { MeteoraClmmFetchPoolsRequest } from '../schemas';

export const fetchPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: {
      network?: string;
      page?: number;
      limit?: number;
      query?: string;
      sortBy?: string;
      includeUnverified?: boolean;
    };
  }>('/fetch-pools', {
    schema: {
      description: 'Fetch Meteora pools from API with search and sorting',
      tags: ['/connector/meteora'],
      querystring: MeteoraClmmFetchPoolsRequest,
      response: {
        200: FetchPoolsResponse,
      },
    },
    handler: async (request, _reply) => {
      try {
        const { network, page, limit, query, sortBy, includeUnverified } = request.query;

        const meteora = await Meteora.getInstance(network);

        const result = await meteora.fetchPoolsFromApi({
          page,
          limit,
          query,
          sortBy,
          includeUnverified,
        });

        // Map API response to simplified format
        const pools = result.pools.map((pool: MeteoraApiPool) => ({
          address: pool.address,
          name: pool.name,
          baseTokenAddress: pool.token_x.address,
          baseTokenSymbol: pool.token_x.symbol,
          quoteTokenAddress: pool.token_y.address,
          quoteTokenSymbol: pool.token_y.symbol,
          binStep: pool.pool_config.bin_step,
          baseFee: pool.pool_config.base_fee_pct,
          price: pool.current_price,
          tvl: pool.tvl,
          apr: pool.apr,
          apy: pool.apy,
          volume24h: pool.volume?.['24h'],
          fees24h: pool.fees?.['24h'],
        }));

        return {
          pools,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
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

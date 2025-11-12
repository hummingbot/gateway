import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { PoolInfo, PoolInfoSchema, FetchPoolsRequestType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { OrcaClmmFetchPoolsRequest } from '../schemas';
// Using Fastify's native error handling

export const fetchPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: FetchPoolsRequestType;
    Reply: PoolInfo[];
  }>('/fetch-pools', {
    schema: {
      description: 'Fetch info about Orca pools',
      tags: ['/connector/orca'],
      querystring: OrcaClmmFetchPoolsRequest,
      response: {
        200: Type.Array(PoolInfoSchema),
      },
    },
    handler: async (request, _reply) => {
      try {
        const { limit, tokenA, tokenB } = request.query;
        const network = request.query.network;

        const orca = await Orca.getInstance(network);
        const solana = await Solana.getInstance(network);

        // Get token symbols for API search
        let tokenSymbolA: string | undefined;
        let tokenSymbolB: string | undefined;

        if (tokenA) {
          const tokenInfoA = await solana.getToken(tokenA);
          if (!tokenInfoA) {
            throw fastify.httpErrors.notFound(`Token ${tokenA} not found`);
          }
          tokenSymbolA = tokenInfoA.symbol;
        }

        if (tokenB) {
          const tokenInfoB = await solana.getToken(tokenB);
          if (!tokenInfoB) {
            throw fastify.httpErrors.notFound(`Token ${tokenB} not found`);
          }
          tokenSymbolB = tokenInfoB.symbol;
        }

        // getPools now returns mapped OrcaPoolInfo objects directly
        const pools = await orca.getPools(limit, tokenSymbolA, tokenSymbolB);

        if (!Array.isArray(pools) || pools.length === 0) {
          logger.info('No matching Orca pools found');
          return [];
        }

        return pools;
      } catch (e) {
        logger.error('Error in fetch-pools:', e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Error processing the request');
      }
    },
  });
};

export default fetchPoolsRoute;

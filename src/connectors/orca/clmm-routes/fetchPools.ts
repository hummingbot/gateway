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

        let tokenMintA, tokenMintB;

        if (tokenA) {
          const tokenInfoA = await solana.getToken(tokenA);
          if (!tokenInfoA) {
            throw fastify.httpErrors.notFound(`Token ${tokenA} not found`);
          }
          tokenMintA = tokenInfoA.address;
        }

        if (tokenB) {
          const tokenInfoB = await solana.getToken(tokenB);
          if (!tokenInfoB) {
            throw fastify.httpErrors.notFound(`Token ${tokenB} not found`);
          }
          tokenMintB = tokenInfoB.address;
        }

        const pools = await orca.getPools(limit, tokenMintA, tokenMintB);
        if (!Array.isArray(pools)) {
          logger.error('No matching Orca pools found');
          return [];
        }

        const poolInfos = await Promise.all(
          pools
            .filter((pool) => pool?.address)
            .map(async (pool) => {
              try {
                return await orca.getPoolInfo(pool.address);
              } catch (error) {
                logger.error(`Failed to get pool info for ${pool.address}: ${error.message}`);
                throw fastify.httpErrors.notFound(`Pool not found: ${pool.address}`);
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

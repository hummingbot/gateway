import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { PoolInfo, PoolInfoSchema, FetchPoolsRequestType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmFetchPoolsRequest } from '../schemas';
// Using Fastify's native error handling

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
        const { limit, tokenA, tokenB } = request.query;
        const network = request.query.network;

        const meteora = await Meteora.getInstance(network);
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

        const pairs = await meteora.getPools(limit, tokenMintA, tokenMintB);
        if (!Array.isArray(pairs)) {
          logger.error('No matching Meteora pools found');
          return [];
        }

        const poolInfos = await Promise.all(
          pairs
            .filter((pair) => pair?.publicKey?.toString)
            .map(async (pair) => {
              try {
                return await meteora.getPoolInfo(pair.publicKey.toString());
              } catch (error) {
                logger.error(`Failed to get pool info for ${pair.publicKey.toString()}: ${error.message}`);
                throw fastify.httpErrors.notFound(`Pool not found: ${pair.publicKey.toString()}`);
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

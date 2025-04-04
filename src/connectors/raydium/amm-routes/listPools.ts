import { FastifyPluginAsync } from 'fastify';
import { Raydium } from '../raydium';
import { logger } from '../../../services/logger';
import { isValidAmm, isValidCpmm, isValidClmm } from '../raydium.utils';
import {
  ListPoolsRequestType,
  ListPoolsResponse,
  ListPoolsResponseType
} from '../../../schemas/trading-types/amm-schema';

/**
 * Route handler for getting Raydium pools
 */
export const listPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: ListPoolsRequestType;
    Reply: ListPoolsResponseType;
  }>(
      '/list-pools',
      {
        schema: {
          description: 'List available Raydium pools',
          tags: ['raydium-amm'],
          querystring: {
            properties: {
              network: { type: 'string', examples: ['mainnet-beta'] }
            }
          },
          response: {
            200: ListPoolsResponse
          }
        }
      },
      async (request) => {
        try {
          const network = request.query.network || 'mainnet-beta';
          logger.info(`Listing Raydium pools on network: ${network}`);

          // Get the singleton Raydium instance for the network.
          const raydium = await Raydium.getInstance(network);
          if (!raydium) {
            throw fastify.httpErrors.serviceUnavailable('Raydium service unavailable');
          }

          // Use the updated method which calls the new getPoolList API internally.
          const allPools = await raydium.getAllPoolsFromAPI();

          // Map the pool info to your desired output format.
          const pools = allPools.map((poolInfo) => {
            let poolType = 'Unknown';
            if (isValidAmm(poolInfo.programId)) {
              poolType = 'amm';
            } else if (isValidCpmm(poolInfo.programId)) {
              poolType = 'cpmm';
            } else if (isValidClmm(poolInfo.programId)) {
              poolType = 'clmm';
            }

            return {
              address: poolInfo.id, // assumes "id" represents the pool address
              type: poolType,
              tokens: [
                poolInfo.mintA?.symbol || poolInfo.mintA?.address,
                poolInfo.mintB?.symbol || poolInfo.mintB?.address
              ]
            };
          });

          return { pools };
        } catch (e) {
          logger.error(`Error listing Raydium pools:`, e);
          throw fastify.httpErrors.internalServerError('Internal server error');
        }
      }
  );
};

export default listPoolsRoute;

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
        
        const raydium = await Raydium.getInstance(network);
        if (!raydium) {
          throw fastify.httpErrors.serviceUnavailable('Raydium service unavailable');
        }

        // Note: The Raydium SDK doesn't provide a direct method to fetch all pools
        // We'll return a list of popular/well-known pools as a sample

        // Define some popular pool addresses to fetch (example addresses)
        const popularPoolIds = [
          // SOL-USDC pool
          'AVs9TA4nWDzfPJE9gGVNJMVhcQy3V9PGazuz33BfG2RA',
          // SOL-USDT pool
          '7XawhbbxtsRcQA8KTkHT9f9nc6d69UwqCDh6U5EEbEmX',
          // RAY-USDC pool
          'DsBuJBMfoNmCiRvUypTVidrW4YqBpyFwbuA7ZBiNjsnc'
        ];

        const pools = [];
        
        for (const poolId of popularPoolIds) {
          try {
            const [poolInfo] = await raydium.getPoolfromAPI(poolId);
            if (poolInfo) {
              // Determine pool type based on program ID
              let poolType = 'Unknown';
              if (isValidAmm(poolInfo.programId)) {
                poolType = 'amm';
              } else if (isValidCpmm(poolInfo.programId)) {
                poolType = 'cpmm';
              } else if (isValidClmm(poolInfo.programId)) {
                poolType = 'clmm';
              }
              
              // Get token symbols
              const tokens = [
                poolInfo.mintA?.symbol || poolInfo.mintA?.address || 'Unknown',
                poolInfo.mintB?.symbol || poolInfo.mintB?.address || 'Unknown'
              ];
              
              pools.push({
                address: poolInfo.id,
                type: poolType,
                tokens: tokens
              });
            }
          } catch (error) {
            logger.error(`Error fetching pool info for ${poolId}:`, error);
            // Continue to the next pool
          }
        }

        return { pools };
      } catch (e) {
        logger.error(`Error listing Raydium pools:`, e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default listPoolsRoute;

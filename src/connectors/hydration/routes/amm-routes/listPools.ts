import { FastifyPluginAsync } from 'fastify';
import { Hydration } from '../../hydration';
import { logger } from '../../../../services/logger';
import {
  ListPoolsRequestType,
  ListPoolsResponse,
  ListPoolsResponseType
} from '../../../../schemas/trading-types/amm-schema';

/**
 * Route handler for getting all pools
 */
export const listPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: ListPoolsRequestType;
    Reply: ListPoolsResponseType;
  }>(
    '/list-pools',
    {
      schema: {
        description: 'List all available Hydration pools',
        tags: ['hydration'],
        querystring: {
          properties: {
            network: { type: 'string', examples: ['mainnet'] }
          }
        },
        response: {
          200: ListPoolsResponse
        }
      }
    },
    async (request) => {
      try {
        const network = request.query.network || 'mainnet';
        logger.info(`Listing all pools on network: ${network}`);
        
        const hydration = await Hydration.getInstance(network);
        if (!hydration) {
          throw fastify.httpErrors.serviceUnavailable('Hydration service unavailable');
        }

        // Get Hydration instance
        const hydrationInstance = await Hydration.getInstance(network);
        
        try {
          // Get all pool addresses first
          const poolAddresses = await hydrationInstance.getPoolAddresses();
          
          // Get pool info for each address
          const pools = await Promise.all(
            poolAddresses.map(address => hydrationInstance.getPoolInfo(address))
          );

          // Filter out null values and map to response format
          const poolList = (await Promise.all(
            pools.filter(Boolean).map(async pool => {
              const baseTokenSymbol = await hydrationInstance.getTokenSymbol(pool.baseTokenAddress);
              const quoteTokenSymbol = await hydrationInstance.getTokenSymbol(pool.quoteTokenAddress);
              
              return {
                address: pool.address,
                type: pool.poolType || 'Unknown',
                tokens: [baseTokenSymbol, quoteTokenSymbol],
                fee: pool.feePct
              };
            })
          )).filter(pool => pool.tokens.every(symbol => symbol !== '2-Pool' && symbol !== '4-Pool'));

          return { pools: poolList };
        } catch (e) {
          logger.error(`Error listing pools:`, e);
          throw fastify.httpErrors.internalServerError('Internal server error');
        }
      } catch (e) {
        logger.error(`Error listing pools:`, e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default listPoolsRoute;

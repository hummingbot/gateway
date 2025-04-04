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

        // Get all pools
        const pools = await hydration.getAllPools();
        
        // Format pool information
        const formattedPools = pools.map(pool => ({
          address: pool.address,
          type: pool.type || 'Unknown',
          tokens: pool.tokens.map(t => t.symbol).filter(symbol => symbol !== '2-Pool' && symbol !== '4-Pool')
        }));

        return { pools: formattedPools };
      } catch (e) {
        logger.error(`Error listing pools:`, e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default listPoolsRoute;

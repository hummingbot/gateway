import { FastifyPluginAsync } from 'fastify';
import { Hydration } from '../../hydration';
import { logger } from '../../../../services/logger';

/**
 * Route handler for getting all pools
 */
export const listPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { network?: string };
    Reply: { pools: Array<{ address: string; type: string; tokens: string[] }> };
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
          tokens: pool.tokens.map(t => t.symbol)
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

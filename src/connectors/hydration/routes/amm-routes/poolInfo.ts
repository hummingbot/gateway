import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Hydration } from '../../hydration';
import { logger } from '../../../../services/logger';
import {
  HydrationPoolInfo,
  HydrationPoolInfoSchema,
  HydrationGetPoolInfoRequest,
  HydrationGetPoolInfoRequestSchema
} from '../../hydration.types';
import { HttpException } from '../../../../services/error-handler';

/**
 * Retrieves detailed information about a specific Hydration pool.
 * 
 * @param fastify - Fastify instance
 * @param network - The blockchain network (e.g., 'mainnet')
 * @param poolAddress - Address of the pool to retrieve information for
 * @returns Detailed pool information
 */
export async function getHydrationPoolInfo(
  _fastify: FastifyInstance,
  network: string,
  poolAddress: string
): Promise<HydrationPoolInfo> {
  if (!network) {
    throw new HttpException(400, 'Network parameter is required', -1);
  }
  
  if (!poolAddress) {
    throw new HttpException(400, 'Pool address parameter is required', -1);
  }

  const hydration = await Hydration.getInstance(network);
  if (!hydration) {
    throw new HttpException(503, 'Hydration service unavailable', -1);
  }

  // Get pool information with proper typing
  const poolInfo = await hydration.getPoolDetails(poolAddress);
  if (!poolInfo) {
    throw new HttpException(404, `Pool not found: ${poolAddress}`, -1);
  }

  return poolInfo;
}

// Define error response interface
interface ErrorResponse {
  error: string;
}

/**
 * Route plugin that registers the pool-info endpoint.
 * Exposes an endpoint for retrieving detailed information about a specific pool.
 */
export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: HydrationGetPoolInfoRequest;
    Reply: HydrationPoolInfo | ErrorResponse;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get pool information for a Hydration pool',
        tags: ['hydration'],
        querystring: HydrationGetPoolInfoRequestSchema,
        response: {
          200: HydrationPoolInfoSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network || 'mainnet';

        const result = await getHydrationPoolInfo(
          fastify,
          network,
          poolAddress
        );

        return result;
      } catch (error) {
        logger.error('Error in pool-info endpoint:', error);

        if (error.statusCode) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        if (error.message?.includes('not found')) {
          return reply.status(404).send({ error: error.message });
        }

        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default poolInfoRoute;


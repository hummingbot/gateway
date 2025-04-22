import { FastifyPluginAsync } from 'fastify';
import { Hydration } from '../../hydration';
import { logger } from '../../../../services/logger';
import {
  HydrationPoolInfo,
  HydrationPoolInfoSchema,
  HydrationGetPoolInfoRequest,
  HydrationGetPoolInfoRequestSchema
} from '../../hydration.types';

// Define error response interface
interface ErrorResponse {
  error: string;
}

/**
 * Route handler for retrieving pool information.
 * Provides detailed data about a specific liquidity pool.
 */
export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  // Define error response schema
  const ErrorResponseSchema = {
    type: 'object',
    properties: {
      error: { type: 'string' }
    }
  };

  // Existing pool-info endpoint
  fastify.get<{
    Querystring: HydrationGetPoolInfoRequest;
    Reply: HydrationPoolInfo | ErrorResponse;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get pool information for a Hydration pool',
        tags: ['hydration'],
        querystring: {
          ...HydrationGetPoolInfoRequestSchema,
          properties: {
            network: { type: 'string', examples: ['mainnet'] },
            poolAddress: { type: 'string', examples: ['poolAddressXyk'] }
          }
        },
        response: {
          200: HydrationPoolInfoSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema
        },
      }
    },
    async (request): Promise<HydrationPoolInfo> => {
      const { poolAddress } = request.query;
      const network = request.query.network || 'mainnet';

      const hydration = await Hydration.getInstance(network);
      if (!hydration) {
        throw fastify.httpErrors.serviceUnavailable('Hydration service unavailable');
      }

      // Get pool information
      const poolInfo = await hydration.getPoolInfo(poolAddress);
      if (!poolInfo) {
        throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
      }

      // Map to standard PoolInfo interface with safe property access
      const result: HydrationPoolInfo = {
        address: poolInfo.address,
        baseTokenAddress: poolInfo.baseTokenAddress,
        quoteTokenAddress: poolInfo.quoteTokenAddress,
        feePct: poolInfo.feePct,
        price: poolInfo.price,
        baseTokenAmount: poolInfo.baseTokenAmount,
        quoteTokenAmount: poolInfo.quoteTokenAmount,
        poolType: poolInfo.poolType,
        lpMint: {
          address: '',
          decimals: 0
        }
      };

      return result;
    }
  );
};

export default poolInfoRoute;


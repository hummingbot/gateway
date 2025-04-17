import { FastifyPluginAsync } from 'fastify';
import { Hydration } from '../../hydration';
import { logger } from '../../../../services/logger';
import {
  PoolInfo,
  PoolInfoSchema,
  GetPoolInfoRequestType,
  GetPoolInfoRequest
} from '../../../../schemas/trading-types/amm-schema';

/**
 * Route handler for getting pool information
 */
export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  // Existing pool-info endpoint
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: PoolInfo;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get pool information for a Hydration pool',
        tags: ['hydration'],
        querystring: {
          ...GetPoolInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet'] },
            poolAddress: { type: 'string', examples: ['poolAddressXyk'] }
          }
        },
        response: {
          200: PoolInfoSchema
        },
      }
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network || 'mainnet';

        logger.info(`Getting pool info for: ${poolAddress} on network: ${network}`);
        logger.debug('Request query:', JSON.stringify(request.query, null, 2));

        const hydration = await Hydration.getInstance(network);
        if (!hydration) {
          throw fastify.httpErrors.serviceUnavailable('Hydration service unavailable');
        }

        // Get pool information
        const poolInfo = await hydration.getPoolInfo(poolAddress);
        if (!poolInfo) {
          logger.error(`Pool not found: ${poolAddress}`);
          throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
        }

        // Log the pool info structure for debugging
        logger.debug('Hydration pool info structure:', JSON.stringify(poolInfo));

        // Map to standard PoolInfo interface with safe property access
        const result: PoolInfo = {
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
      } catch (e) {
        logger.error(`Error in pool-info:`, e);
        if (e.statusCode) {
          throw e; // Re-throw HTTP errors with their status codes
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default poolInfoRoute;


import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Hydration } from '../../hydration';
import { logger } from '../../../../services/logger';
import {
  HydrationQuoteLiquidityRequest,
  HydrationQuoteLiquidityRequestSchema,
  HydrationQuoteLiquidityResponse,
  HydrationQuoteLiquidityResponseSchema
} from '../../hydration.types';

/**
 * Gets a liquidity quote for adding liquidity to a Hydration pool.
 * 
 * @param fastify - Fastify instance
 * @param network - The blockchain network (e.g., 'mainnet')
 * @param poolAddress - Address of the pool to get quote for
 * @param baseTokenAmount - Optional amount of base token to add
 * @param quoteTokenAmount - Optional amount of quote token to add
 * @param slippagePct - Slippage percentage to account for (default: 1%)
 * @returns Liquidity quote with token amounts and price limits
 */
export async function getHydrationLiquidityQuote(
  _fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct: number = 1
): Promise<HydrationQuoteLiquidityResponse> {
  if (!network) {
    throw new Error('Network parameter is required');
  }
  
  if (!poolAddress) {
    throw new Error('Pool address parameter is required');
  }
  
  if (!baseTokenAmount && !quoteTokenAmount) {
    throw new Error('Either baseTokenAmount or quoteTokenAmount must be provided');
  }

  const hydration = await Hydration.getInstance(network);
  if (!hydration) {
    throw new Error('Hydration service unavailable');
  }

  try {
    const quote = await hydration.quoteLiquidity(
      poolAddress,
      baseTokenAmount,
      quoteTokenAmount,
      slippagePct
    );
    
    return quote;
  } catch (error) {
    if (error.message?.includes('not found')) {
      throw new Error(error.message);
    }
    logger.error(`Error getting liquidity quote: ${error.message}`);
    throw new Error('Failed to get liquidity quote');
  }
}

// Define error response interface
interface ErrorResponse {
  error: string;
}

/**
 * Route plugin that registers the quote-liquidity endpoint.
 * Exposes an endpoint for getting liquidity quotes for adding liquidity to pools.
 */
export const quoteLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: HydrationQuoteLiquidityRequest;
    Reply: HydrationQuoteLiquidityResponse | ErrorResponse;
  }>(
    '/quote-liquidity',
    {
      schema: {
        description: 'Get a liquidity quote for adding liquidity to a Hydration pool',
        tags: ['hydration'],
        querystring: HydrationQuoteLiquidityRequestSchema,
        response: {
          200: HydrationQuoteLiquidityResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { 
          network = 'mainnet',
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct = 1
        } = request.query;

        const result = await getHydrationLiquidityQuote(
          fastify,
          network,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        );

        return result;
      } catch (error) {
        logger.error('Error in quote-liquidity endpoint:', error);

        if (error.statusCode) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        if (error.message?.includes('not found')) {
          return reply.status(404).send({ error: error.message });
        } else if (error.message?.includes('must be provided')) {
          return reply.status(400).send({ error: error.message });
        }

        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default quoteLiquidityRoute;


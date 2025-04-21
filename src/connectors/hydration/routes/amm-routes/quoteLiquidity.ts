import { FastifyPluginAsync } from 'fastify';
import { Hydration } from '../../hydration';
import { logger } from '../../../../services/logger';
import { httpBadRequest, httpNotFound } from '../../../../services/error-handler';
import {
  QuoteLiquidityRequest,
  QuoteLiquidityRequestType,
  QuoteLiquidityResponse,
  QuoteLiquidityResponseType
} from '../../../../schemas/trading-types/amm-schema';

/**
 * Route handler for getting a liquidity quote.
 * Provides estimates for adding liquidity to a specific pool.
 */
export const quoteLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuoteLiquidityRequestType;
    Reply: QuoteLiquidityResponseType;
  }>(
    '/quote-liquidity',
    {
      schema: {
        description: 'Get a liquidity quote for adding liquidity to a Hydration pool',
        tags: ['hydration'],
        querystring: {
          ...QuoteLiquidityRequest,
          properties: {
            ...QuoteLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            poolAddress: { type: 'string', examples: ['hydration-pool-0'] },
            baseTokenAmount: { type: 'number', examples: [1] },
            quoteTokenAmount: { type: 'number', examples: [1] },
            slippagePct: { type: 'number', examples: [1] }
          }
        },
        response: {
          200: QuoteLiquidityResponse
        },
      }
    },
    async (request) => {
      try {
        const { 
          network = 'mainnet',
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct = 1
        } = request.query;

        // Get Hydration instance
        const hydration = await Hydration.getInstance(network);
        
        // Call the business logic method from the Hydration class
        const quote = await hydration.quoteLiquidity(
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        );
        
        return quote;
      } catch (error) {
        // Map specific errors to HTTP errors
        if (error.message?.includes('not found')) {
          throw httpNotFound(error.message);
        }
        if (error.message?.includes('must be provided')) {
          throw httpBadRequest(error.message);
        }
        
        // Log and rethrow any unexpected errors
        logger.error('Error in quote-liquidity:', error);
        if (error.statusCode) {
          throw fastify.httpErrors.createError(error.statusCode, error.message);
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default quoteLiquidityRoute;


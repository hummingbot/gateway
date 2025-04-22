import { FastifyPluginAsync } from 'fastify';
import { Hydration } from '../../hydration';
import { logger } from '../../../../services/logger';
import {
  HydrationGetSwapQuoteRequest,
  HydrationGetSwapQuoteRequestSchema,
  HydrationGetSwapQuoteResponse,
  HydrationGetSwapQuoteResponseSchema
} from '../../hydration.types';
import { httpBadRequest, httpNotFound } from '../../../../services/error-handler';

// Define error response interface
interface ErrorResponse {
  error: string;
}

/**
 * Route handler for getting swap quotes.
 * Provides price estimates and token amounts for potential swaps.
 */
export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  // Define error response schema
  const ErrorResponseSchema = {
    type: 'object',
    properties: {
      error: { type: 'string' }
    }
  };

  fastify.get<{
    Querystring: HydrationGetSwapQuoteRequest;
    Reply: HydrationGetSwapQuoteResponse | ErrorResponse;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get a swap quote for Hydration',
        tags: ['hydration'],
        querystring: {
          ...HydrationGetSwapQuoteRequestSchema,
          properties: {
            ...HydrationGetSwapQuoteRequestSchema.properties,
            network: { type: 'string', default: 'mainnet' },
            baseToken: { type: 'string', examples: ['DOT'] },
            quoteToken: { type: 'string', examples: ['USDT'] },
            amount: { type: 'number', examples: [1.5] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            poolAddress: { type: 'string', examples: ['hydration-pool-0'] },
            slippagePct: { type: 'number', examples: [0.5] }
          }
        },
        response: {
          200: HydrationGetSwapQuoteResponseSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema
        },
      }
    },
    async (request) => {
      try {
        const { network, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.query as HydrationGetSwapQuoteRequest;
        const networkToUse = network || 'mainnet';

        // Validate inputs
        if (!baseToken || !quoteToken) {
          throw httpBadRequest('Base token and quote token are required');
        }

        if (!amount || amount <= 0) {
          throw httpBadRequest('Amount must be a positive number');
        }

        if (side !== 'BUY' && side !== 'SELL') {
          throw httpBadRequest('Side must be "BUY" or "SELL"');
        }

        const hydration = await Hydration.getInstance(networkToUse);
        
        // Get swap quote from Hydration service
        const quote = await hydration.getSwapQuote(
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddress,
          slippagePct
        );
        
        // Map to response schema
        return {
          estimatedAmountIn: quote.estimatedAmountIn,
          estimatedAmountOut: quote.estimatedAmountOut,
          minAmountOut: quote.minAmountOut,
          maxAmountIn: quote.maxAmountIn,
          baseTokenBalanceChange: quote.baseTokenBalanceChange,
          quoteTokenBalanceChange: quote.quoteTokenBalanceChange,
          price: quote.price,
          gasPrice: quote.gasPrice,
          gasLimit: quote.gasLimit,
          gasCost: quote.gasCost
        };
      } catch (error) {
        // Handle specific error types
        if (error.message?.includes('not found')) {
          throw httpNotFound(error.message);
        }
        
        // Propagate HTTP errors or convert to internal server error
        logger.error('Error in quote-swap:', error);
        if (error.statusCode) {
          throw fastify.httpErrors.createError(error.statusCode, error.message || 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default quoteSwapRoute;
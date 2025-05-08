import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Hydration } from '../../hydration';
import { logger } from '../../../../services/logger';
import {
  HydrationGetSwapQuoteRequest,
  HydrationGetSwapQuoteRequestSchema,
  HydrationGetSwapQuoteResponse,
  HydrationGetSwapQuoteResponseSchema
} from '../../hydration.types';

/**
 * Gets a swap quote for a potential token exchange on Hydration.
 * 
 * @param fastify - Fastify instance
 * @param network - The blockchain network (e.g., 'mainnet')
 * @param baseToken - Base token symbol or address
 * @param quoteToken - Quote token symbol or address
 * @param amount - Amount to swap
 * @param side - 'BUY' or 'SELL'
 * @param poolAddress - Optional pool address for specific pool
 * @param slippagePct - Optional slippage percentage (default from config)
 * @returns Swap quote with estimated amounts and price information
 */
export async function getHydrationSwapQuote(
  _fastify: FastifyInstance,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress?: string,
  slippagePct?: number
): Promise<HydrationGetSwapQuoteResponse> {
  if (!network) {
    throw new Error('Network parameter is required');
  }
  
  if (!baseToken) {
    throw new Error('Base token parameter is required');
  }
  
  if (!quoteToken) {
    throw new Error('Quote token parameter is required');
  }
  
  if (!amount || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }
  
  if (side !== 'BUY' && side !== 'SELL') {
    throw new Error('Side must be "BUY" or "SELL"');
  }

  const hydration = await Hydration.getInstance(network);
  if (!hydration) {
    throw new Error('Hydration service unavailable');
  }

  try {
    const quote = await hydration.getSwapQuote(
      baseToken,
      quoteToken,
      amount,
      side,
      poolAddress,
      slippagePct
    );
    
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
    if (error.message?.includes('not found') || error.message?.includes('not supported')) {
      throw new Error(error.message);
    }
    
    logger.error(`Error getting swap quote: ${error.message}`);
    throw new Error('Failed to get swap quote');
  }
}

// Define error response interface
interface ErrorResponse {
  error: string;
}

/**
 * Route plugin that registers the quote-swap endpoint.
 * Exposes an endpoint for getting swap quotes for potential token exchanges.
 */
export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: HydrationGetSwapQuoteRequest;
    Reply: HydrationGetSwapQuoteResponse | ErrorResponse;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get a swap quote for Hydration',
        tags: ['hydration'],
        querystring: HydrationGetSwapQuoteRequestSchema,
        response: {
          200: HydrationGetSwapQuoteResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { 
          network = 'mainnet', 
          baseToken, 
          quoteToken, 
          amount, 
          side, 
          poolAddress, 
          slippagePct 
        } = request.query;

        const result = await getHydrationSwapQuote(
          fastify,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddress,
          slippagePct
        );

        return result;
      } catch (error) {
        logger.error('Error in quote-swap endpoint:', error);

        if (error.statusCode) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        if (error.message?.includes('not found') || error.message?.includes('not supported')) {
          return reply.status(404).send({ error: error.message });
        } else if (error.message?.includes('required') || 
                   error.message?.includes('must be') ||
                   error.message?.includes('positive number')) {
          return reply.status(400).send({ error: error.message });
        }

        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default quoteSwapRoute;
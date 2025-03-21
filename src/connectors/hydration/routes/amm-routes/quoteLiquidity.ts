import { FastifyPluginAsync } from 'fastify';
import { Hydration } from '../../hydration';
import { logger } from '../../../../services/logger';
import { PositionStrategyType } from '../../hydration.types';
import { httpNotFound } from '../../../../services/error-handler';
import { 
  QuoteLiquidityRequest,
  QuoteLiquidityRequestType,
  QuoteLiquidityResponse,
  QuoteLiquidityResponseType
} from '../../../../services/amm-interfaces';

/**
 * Route handler for getting a liquidity quote
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
          slippagePct
        } = request.query as QuoteLiquidityRequestType;

        const hydration = await Hydration.getInstance(network);
        
        try {
          // Get pool info to determine price range
          const poolInfo = await hydration.getPoolInfo(poolAddress);
          if (!poolInfo) {
            throw httpNotFound(`Pool not found: ${poolAddress}`);
          }

          // Calculate price range based on current price
          const currentPrice = poolInfo.price;
          const lowerPrice = currentPrice * 0.95; // 5% below current price
          const upperPrice = currentPrice * 1.05; // 5% above current price

          // Get liquidity quote
          const quote = await hydration.getLiquidityQuote(
            poolAddress,
            lowerPrice,
            upperPrice,
            baseTokenAmount || quoteTokenAmount,
            baseTokenAmount ? 'base' : 'quote',
            PositionStrategyType.Balanced
          );
          
          // Map to standard AMM interface response
          return {
            baseLimited: Boolean(baseTokenAmount),
            baseTokenAmount: quote.baseTokenAmount,
            quoteTokenAmount: quote.quoteTokenAmount,
            baseTokenAmountMax: quote.baseTokenAmount * (1 + (slippagePct || 0.01)), // Add slippage
            quoteTokenAmountMax: quote.quoteTokenAmount * (1 + (slippagePct || 0.01)) // Add slippage
          };
        } catch (error) {
          logger.error(`Failed to get liquidity quote: ${error.message}`);
          if (error.message.includes('not found')) {
            throw httpNotFound(error.message);
          }
          throw error;
        }
      } catch (e) {
        logger.error('Error in quote-liquidity:', e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, e.message);
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default quoteLiquidityRoute;


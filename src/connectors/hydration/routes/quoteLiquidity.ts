import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Hydration } from '../hydration';
import { logger } from '../../../services/logger';
import { PositionStrategyType } from '../hydration.types';
import { httpBadRequest, httpNotFound } from '../../../services/error-handler';

// Schema definitions
const QuoteLiquidityRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet' })),
  poolAddress: Type.String({ examples: ['hydration-pool-0'] }),
  lowerPrice: Type.Number({ examples: [9.5] }),
  upperPrice: Type.Number({ examples: [11.5] }),
  amount: Type.Number({ examples: [10] }),
  amountType: Type.Union([
    Type.Literal('base'),
    Type.Literal('quote')
  ], { examples: ['base'] }),
  strategyType: Type.Optional(Type.Number({ 
    enum: Object.values(PositionStrategyType).filter(x => typeof x === 'number'),
    examples: [PositionStrategyType.Balanced]
  }))
});

const QuoteLiquidityResponse = Type.Object({
  baseTokenAmount: Type.Number(),
  quoteTokenAmount: Type.Number(),
  lowerPrice: Type.Number(),
  upperPrice: Type.Number(),
  liquidity: Type.Number()
});

type QuoteLiquidityRequestType = Static<typeof QuoteLiquidityRequest>;
type QuoteLiquidityResponseType = Static<typeof QuoteLiquidityResponse>;

/**
 * Route handler for getting a liquidity quote
 */
export const quoteLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/quote-liquidity',
    {
      schema: {
        description: 'Get a liquidity quote for adding liquidity to a Hydration pool',
        tags: ['hydration'],
        querystring: QuoteLiquidityRequest,
        response: {
          200: QuoteLiquidityResponse
        },
      }
    },
    async (request) => {
      try {
        const { 
          network, 
          poolAddress, 
          lowerPrice, 
          upperPrice, 
          amount, 
          amountType,
          strategyType 
        } = request.query as QuoteLiquidityRequestType;
        const networkToUse = network || 'mainnet';

        // Validate inputs
        if (lowerPrice >= upperPrice) {
          throw httpBadRequest('Lower price must be less than upper price');
        }

        if (!amount || amount <= 0) {
          throw httpBadRequest('Amount must be a positive number');
        }

        const hydration = await Hydration.getInstance(networkToUse);
        
        try {
          const quote = await hydration.getLiquidityQuote(
            poolAddress,
            lowerPrice,
            upperPrice,
            amount,
            amountType as 'base' | 'quote',
            strategyType ?? PositionStrategyType.Balanced
          );
          
          return {
            baseTokenAmount: quote.baseTokenAmount,
            quoteTokenAmount: quote.quoteTokenAmount,
            lowerPrice: quote.lowerPrice,
            upperPrice: quote.upperPrice,
            liquidity: quote.liquidity
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
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default quoteLiquidityRoute;


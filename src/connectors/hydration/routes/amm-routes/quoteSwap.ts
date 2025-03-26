import { FastifyPluginAsync } from 'fastify';
import { Hydration } from '../../hydration';
import { logger } from '../../../../services/logger';
import { 
  GetSwapQuoteRequestType,
  GetSwapQuoteResponseType,
  GetSwapQuoteRequest,
  GetSwapQuoteResponse,
  GetCLMMSwapQuoteRequestType
} from '../../../../schemas/trading-types/swap-schema';
import { httpBadRequest, httpNotFound } from '../../../../services/error-handler';

/**
 * Route handler for getting a swap quote
 */
export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/quote-swap',
    {
      schema: {
        description: 'Get a swap quote for Hydration',
        tags: ['hydration'],
        querystring: {
          ...GetSwapQuoteRequest,
          properties: {
            ...GetSwapQuoteRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            baseToken: { type: 'string', examples: ['DOT'] },
            quoteToken: { type: 'string', examples: ['USDT'] },
            amount: { type: 'number', examples: [1.5] },
            side: { type: 'string', enum: ['buy', 'sell'], examples: ['sell'] },
            poolAddress: { type: 'string', examples: ['hydration-pool-0'] },
            slippagePct: { type: 'number', examples: [0.5] }
          }
        },
        response: {
          200: GetSwapQuoteResponse
        },
      }
    },
    async (request) => {
      try {
        const { network, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.query as GetCLMMSwapQuoteRequestType;
        const networkToUse = network || 'mainnet';

        // Validate inputs
        if (!baseToken || !quoteToken) {
          throw httpBadRequest('Base token and quote token are required');
        }

        if (!amount || amount <= 0) {
          throw httpBadRequest('Amount must be a positive number');
        }

        if (side !== 'buy' && side !== 'sell') {
          throw httpBadRequest('Side must be "buy" or "sell"');
        }

        const hydration = await Hydration.getInstance(networkToUse);
        
        try {
          const quote = await hydration.getSwapQuote(
            baseToken,
            quoteToken,
            amount,
            side as 'buy' | 'sell',
            poolAddress,
            slippagePct
          );
          
          // Get token decimals for proper amount conversion
          const baseTokenDecimals = await hydration.getTokenDecimals(baseToken);
          const quoteTokenDecimals = await hydration.getTokenDecimals(quoteToken);
          
          // Convert amounts to proper decimal places
          const estimatedAmountIn = quote.estimatedAmountIn / (10 ** quoteTokenDecimals);
          const estimatedAmountOut = quote.estimatedAmountOut / (10 ** baseTokenDecimals);
          const minAmountOut = quote.minAmountOut / (10 ** baseTokenDecimals);
          const maxAmountIn = quote.maxAmountIn / (10 ** quoteTokenDecimals);
          const baseTokenBalanceChange = quote.baseTokenBalanceChange / (10 ** baseTokenDecimals);
          const quoteTokenBalanceChange = quote.quoteTokenBalanceChange / (10 ** quoteTokenDecimals);
          
          // Calculate price based on side
          const price = side === 'buy' 
            ? estimatedAmountOut / estimatedAmountIn 
            : estimatedAmountIn / estimatedAmountOut;
          
          return {
            estimatedAmountIn,
            estimatedAmountOut,
            minAmountOut,
            maxAmountIn,
            baseTokenBalanceChange,
            quoteTokenBalanceChange,
            price,
            gasPrice: 0,
            gasLimit: 0,
            gasCost: 0
          };
        } catch (error) {
          logger.error(`Failed to get swap quote: ${error.message}`);
          if (error.message.includes('not found')) {
            throw httpNotFound(error.message);
          }
          throw error;
        }
      } catch (e) {
        logger.error('Error in quote-swap:', e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default quoteSwapRoute;


import {FastifyPluginAsync} from 'fastify';
import {Hydration} from '../../hydration';
import {Polkadot} from '../../../../chains/polkadot/polkadot';
import {logger} from '../../../../services/logger';
import {
  HydrationExecuteSwapRequest,
  HydrationExecuteSwapRequestSchema,
  HydrationExecuteSwapResponse,
  HydrationExecuteSwapResponseSchema
} from '../../hydration.types';
import {ExecuteSwapRequest} from '../../../../schemas/trading-types/swap-schema';
import {httpBadRequest, httpNotFound} from '../../../../services/error-handler';

// Define error response interface
interface ErrorResponse {
  error: string;
}

/**
 * Route handler for executing token swaps.
 * Provides an endpoint to perform token exchanges on Hydration protocol.
 */
export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const polkadot = await Polkadot.getInstance('mainnet');
  let firstWalletAddress = '<polkadot-wallet-address>';

  try {
    firstWalletAddress = await polkadot.getFirstWalletAddress();
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }

  // Update schema example
  ExecuteSwapRequest.properties.walletAddress.examples = [firstWalletAddress];

  // Define error response schema
  const ErrorResponseSchema = {
    type: 'object',
    properties: {
      error: { type: 'string' }
    }
  };

  fastify.post<{
    Body: HydrationExecuteSwapRequest;
    Reply: HydrationExecuteSwapResponse | ErrorResponse;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a token swap on Hydration',
        tags: ['hydration'],
        body: {
          ...HydrationExecuteSwapRequestSchema,
          properties: {
            ...HydrationExecuteSwapRequestSchema.properties,
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
          200: HydrationExecuteSwapResponseSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema
        },
      }
    },
    async (request) => {
      try {
        const { walletAddress, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.body as HydrationExecuteSwapRequest;
        const network = (request.body as HydrationExecuteSwapRequest).network || 'mainnet';

        // Get Hydration instance
        const hydration = await Hydration.getInstance(network);
        
        try {
          // Execute the swap using the Hydration class
          const result = await hydration.executeSwapWithWalletAddress(
            network,
            walletAddress,
            baseToken,
            quoteToken,
            amount,
            side as 'BUY' | 'SELL',
            poolAddress,
            slippagePct
          );
          
          return result;
        } catch (error) {
          // Map errors to HTTP errors
          if (error.message?.includes('not found')) {
            throw httpNotFound(error.message);
          }
          if (error.message?.includes('required') || 
              error.message?.includes('must be') ||
              error.message?.includes('must be a positive number') ||
              error.message?.includes('must be "BUY" or "SELL"')) {
            throw httpBadRequest(error.message);
          }
          throw error;
        }
      } catch (e) {
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, e.message || 'Request failed');
        }
        logger.error('Error executing swap:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default executeSwapRoute;


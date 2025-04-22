import {FastifyInstance, FastifyPluginAsync} from 'fastify';
import {Hydration} from '../../hydration';
import {logger} from '../../../../services/logger';
import {
  HydrationExecuteSwapRequest,
  HydrationExecuteSwapRequestSchema,
  HydrationExecuteSwapResponse,
  HydrationExecuteSwapResponseSchema
} from '../../hydration.types';
import {HttpException} from '../../../../services/error-handler';
import {validatePolkadotAddress} from '../../../../chains/polkadot/polkadot.validators';

/**
 * Executes a token swap on the Hydration protocol.
 * 
 * @param fastify - Fastify instance
 * @param network - The blockchain network (e.g., 'mainnet')
 * @param walletAddress - The user's wallet address
 * @param baseToken - Base token symbol or address
 * @param quoteToken - Quote token symbol or address
 * @param amount - Amount to swap
 * @param side - 'BUY' or 'SELL'
 * @param poolAddress - Pool address
 * @param slippagePct - Optional slippage percentage (default from config)
 * @returns Details of the swap execution
 */
export async function executeSwapOnHydration(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct?: number
): Promise<HydrationExecuteSwapResponse> {
  if (!network) {
    throw new HttpException(400, 'Network parameter is required', -1);
  }
  
  if (!baseToken) {
    throw new HttpException(400, 'Base token parameter is required', -1);
  }
  
  if (!quoteToken) {
    throw new HttpException(400, 'Quote token parameter is required', -1);
  }
  
  if (!amount || amount <= 0) {
    throw new HttpException(400, 'Amount must be a positive number', -1);
  }
  
  if (side !== 'BUY' && side !== 'SELL') {
    throw new HttpException(400, 'Side must be "BUY" or "SELL"', -1);
  }
  
  if (!poolAddress) {
    throw new HttpException(400, 'Pool address parameter is required', -1);
  }
  
  // Validate wallet address
  validatePolkadotAddress(walletAddress);
  
  const hydration = await Hydration.getInstance(network);
  return await hydration.executeSwapWithWalletAddress(
    network,
    walletAddress,
    baseToken,
    quoteToken,
    amount,
    side,
    poolAddress,
    slippagePct
  );
}

// Define error response interface
interface ErrorResponse {
  error: string;
}

/**
 * Route plugin that registers the execute-swap endpoint.
 * Exposes an endpoint for executing token swaps on Hydration protocol.
 */
export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: HydrationExecuteSwapRequest;
    Reply: HydrationExecuteSwapResponse | ErrorResponse;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a token swap on Hydration',
        tags: ['hydration'],
        body: HydrationExecuteSwapRequestSchema,
        response: {
          200: HydrationExecuteSwapResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { 
          walletAddress, 
          baseToken, 
          quoteToken, 
          amount, 
          side, 
          poolAddress, 
          slippagePct 
        } = request.body;
        const network = request.body.network || 'mainnet';

        const result = await executeSwapOnHydration(
          fastify,
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
        logger.error('Error in execute-swap endpoint:', error);

        if (error.statusCode) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        if (error.message?.includes('not found') || error.message?.includes('Pool not found')) {
          return reply.status(404).send({ error: error.message });
        } else if (error.message?.includes('Invalid Polkadot address')) {
          return reply.status(400).send({ error: error.message });
        } else if (error.message?.includes('required') || 
                   error.message?.includes('must be') ||
                   error.message?.includes('Insufficient')) {
          return reply.status(400).send({ error: error.message });
        }

        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default executeSwapRoute;


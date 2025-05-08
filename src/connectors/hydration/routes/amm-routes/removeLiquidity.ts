import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Hydration } from '../../hydration';
import { Polkadot } from '../../../../chains/polkadot/polkadot';
import { logger } from '../../../../services/logger';
import { 
  HydrationRemoveLiquidityRequest, 
  HydrationRemoveLiquidityRequestSchema, 
  HydrationRemoveLiquidityResponse, 
  HydrationRemoveLiquidityResponseSchema 
} from '../../hydration.types';
import { validatePolkadotAddress } from '../../../../chains/polkadot/polkadot.validators';
import { RemoveLiquidityRequest } from '../../../../schemas/trading-types/amm-schema';

// Define error response interface
interface ErrorResponse {
  error: string;
}

/**
 * Removes liquidity from a pool.
 * 
 * @param fastify - Fastify instance
 * @param network - The blockchain network (e.g., 'mainnet')
 * @param walletAddress - The user's wallet address
 * @param poolAddress - The pool address to remove liquidity from
 * @param percentageToRemove - Percentage to remove (1-100)
 * @returns Details of the liquidity removal operation
 */
export async function removeLiquidity(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  poolAddress: string,
  percentageToRemove: number
): Promise<HydrationRemoveLiquidityResponse> {
  // Validate inputs
  if (percentageToRemove <= 0 || percentageToRemove > 100) {
    throw new Error('Percentage to remove must be between 0 and 100');
  }

  // Validate address
  validatePolkadotAddress(walletAddress);

  const hydration = await Hydration.getInstance(network);
  
  try {
    const result = await hydration.removeLiquidity(
      walletAddress,
      poolAddress,
      percentageToRemove
    );
    
    return result;
  } catch (error) {
    if (error.message?.includes('not found')) {
      throw new Error(error.message);
    } else if (error.message?.includes('must be between')) {
      throw new Error(error.message);
    }
    
    logger.error(`Error removing liquidity: ${error.message}`);
    throw error;
  }
}

/**
 * Route handler for removing liquidity
 */
export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const polkadot = await Polkadot.getInstance('mainnet');
  let firstWalletAddress = '<polkadot-wallet-address>';
  
  const foundWallet = await polkadot.getFirstWalletAddress();
  if (foundWallet) {
    firstWalletAddress = foundWallet;
  } else {
    logger.debug('No wallets found for examples in schema');
  }
  
  // Update schema example
  RemoveLiquidityRequest.properties.walletAddress.examples = [firstWalletAddress];

  // Define error response schema
  const ErrorResponseSchema = {
    type: 'object',
    properties: {
      error: { type: 'string' }
    }
  };

  fastify.post<{
    Body: HydrationRemoveLiquidityRequest;
    Reply: HydrationRemoveLiquidityResponse | ErrorResponse;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Hydration pool',
        tags: ['hydration'],
        body: {
          ...HydrationRemoveLiquidityRequestSchema,
          properties: {
            ...HydrationRemoveLiquidityRequestSchema.properties,
            network: { type: 'string', default: 'mainnet' },
            poolAddress: { type: 'string', examples: ['hydration-pool-0'] },
            percentageToRemove: { type: 'number', examples: [50] }
          }
        },
        response: {
          200: HydrationRemoveLiquidityResponseSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema
        },
      }
    },
    async (request, reply) => {
      try {
        const { network, walletAddress, poolAddress, percentageToRemove } = request.body as HydrationRemoveLiquidityRequest;
        const networkToUse = network || 'mainnet';
        
        const result = await removeLiquidity(
          fastify,
          networkToUse,
          walletAddress,
          poolAddress,
          percentageToRemove
        );
        
        return reply.send(result);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          return reply.status(e.statusCode).send({ error: e.message || 'Request failed' });
        }
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default removeLiquidityRoute;


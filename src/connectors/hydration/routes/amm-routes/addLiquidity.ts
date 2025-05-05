import {FastifyInstance, FastifyPluginAsync} from 'fastify';
import {Hydration} from '../../hydration';
import {logger} from '../../../../services/logger';
import {validatePolkadotAddress} from '../../../../chains/polkadot/polkadot.validators';
import {
  HydrationAddLiquidityRequest,
  HydrationAddLiquidityRequestSchema,
  HydrationAddLiquidityResponse,
  HydrationAddLiquidityResponseSchema
} from '../../hydration.types';
import {HttpException} from '../../../../services/error-handler';

/**
 * Adds liquidity to a Hydration position.
 * 
 * @param fastify - Fastify instance
 * @param network - The blockchain network (e.g., 'mainnet')
 * @param walletAddress - The user's wallet address
 * @param poolId - The pool ID to add liquidity to
 * @param baseTokenAmount - Amount of base token to add
 * @param quoteTokenAmount - Amount of quote token to add
 * @param slippagePct - Optional slippage percentage (default from config)
 * @returns Details of the liquidity addition operation
 */
export async function addLiquidityToHydration(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  poolId: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct?: number
): Promise<HydrationAddLiquidityResponse> {
  if (!network) {
    throw new HttpException(400, 'Network parameter is required', -1);
  }
  
  if (!poolId) {
    throw new HttpException(400, 'Pool ID parameter is required', -1);
  }
  
  // Validate wallet address
  validatePolkadotAddress(walletAddress);
  
  const hydration = await Hydration.getInstance(network);
  return await hydration.addLiquidity(
    walletAddress,
    poolId,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct
  );
}

// Define error response interface
interface ErrorResponse {
  error: string;
}

/**
 * Route plugin that registers the add-liquidity endpoint.
 * Exposes an endpoint for adding liquidity to specified pools.
 */
export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: HydrationAddLiquidityRequest;
    Reply: HydrationAddLiquidityResponse | ErrorResponse;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Hydration position',
        tags: ['hydration'],
        body: HydrationAddLiquidityRequestSchema,
        response: {
          200: HydrationAddLiquidityResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const {
          walletAddress,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        } = request.body;
        const network = request.body.network || 'mainnet';

        const result = await addLiquidityToHydration(
          fastify,
          network,
          walletAddress,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        );

        return result;
      } catch (error) {
        logger.error('Error in add-liquidity endpoint:', error);

        if (error.statusCode) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        if (error.message?.includes('Pool not found')) {
          return reply.status(404).send({ error: error.message });
        } else if (error.message?.includes('Invalid Polkadot address')) {
          return reply.status(400).send({ error: error.message });
        } else if (error.message?.includes('Insufficient') || 
                   error.message?.includes('Invalid') ||
                   error.message?.includes('You must provide')) {
          return reply.status(400).send({ error: error.message });
        }

        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default addLiquidityRoute;

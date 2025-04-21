import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Hydration } from '../../hydration';
import { Polkadot } from '../../../../chains/polkadot/polkadot';
import { BigNumber } from '@galacticcouncil/sdk/build/types/utils/bignumber';
import { logger } from '../../../../services/logger';
import { validatePolkadotAddress } from '../../../../chains/polkadot/polkadot.validators';
import { httpBadRequest, httpNotFound, ERROR_MESSAGES } from '../../../../services/error-handler';
import {
  AddLiquidityRequest,
  AddLiquidityResponse,
  AddLiquidityRequestType,
  AddLiquidityResponseType
} from '../../../../schemas/trading-types/amm-schema';

/**
 * Add liquidity to a Hydration position
 * @param fastify Fastify instance
 * @param network The blockchain network (e.g., 'mainnet')
 * @param walletAddress The user's wallet address
 * @param poolId The pool ID to add liquidity to
 * @param baseTokenAmount Amount of base token to add
 * @param quoteTokenAmount Amount of quote token to add
 * @param slippagePct Optional slippage percentage (default from config)
 * @returns Details of the liquidity addition
 */
async function addLiquidity(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  poolId: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct?: number
): Promise<AddLiquidityResponseType> {
  const initTime = Date.now();

  // Validate address - Use a simple validation without custom error message
  try {
    validatePolkadotAddress(walletAddress);
  } catch (error) {
    // Use a standard error format instead of the custom ERROR_MESSAGES.INVALID_ADDRESS
    throw httpBadRequest(`Invalid Polkadot address: ${walletAddress}`);
  }

  try {
    const hydration = await Hydration.getInstance(network);
    
    // Call the business logic method from the Hydration class
    const result = await hydration.addLiquidity(
      walletAddress,
      poolId,
      baseTokenAmount,
      quoteTokenAmount, 
      slippagePct
    );
    
    return result;
  } catch (error) {
    // Handle specific error types and convert to HTTP errors
    if (error.message.includes('Pool not found')) {
      throw httpNotFound(error.message);
    } else if (error.message.includes('Insufficient') || 
               error.message.includes('Invalid') ||
               error.message.includes('You must provide')) {
      throw httpBadRequest(error.message);
    }
    
    // Log the error and rethrow
    logger.error(`Error adding liquidity to pool ${poolId}:`, error);
    throw error;
  }
}

/**
 * Register the add-liquidity route
 */
export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const polkadot = await Polkadot.getInstance('mainnet');
  let firstWalletAddress = '1examplePolkadotAddress...';

  // Try to get a real wallet address for examples if available
  try {
    const firstWallet = await polkadot.getFirstWalletAddress();
    if (firstWallet) {
      firstWalletAddress = firstWallet;
    }
  } catch (error) {
    logger.debug('Could not get example wallet address', error);
  }

  // Update schema example
  AddLiquidityRequest.properties.walletAddress.examples = [firstWalletAddress];

  // Fix the Fastify route typing issue
  fastify.post(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Hydration position',
        tags: ['hydration'],
        body: {
          ...AddLiquidityRequest,
          properties: {
            ...AddLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            poolAddress: { type: 'string', examples: ['12345'] }, // Example pool ID
            slippagePct: { type: 'number', examples: [1] },
            baseTokenAmount: { type: 'number', examples: [10] },
            quoteTokenAmount: { type: 'number', examples: [10] },
          }
        },
        response: {
          200: AddLiquidityResponse
        },
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
        } = request.body as AddLiquidityRequestType;
        const network = (request.body as AddLiquidityRequestType).network || 'mainnet';

        const result = await addLiquidity(
          fastify,
          network,
          walletAddress,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        );

        return reply.send(result);
      } catch (e) {
        logger.error('Error in add-liquidity endpoint:', e);

        if (e.statusCode) {
          return reply.status(e.statusCode).send({ error: e.message });
        }
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default addLiquidityRoute;

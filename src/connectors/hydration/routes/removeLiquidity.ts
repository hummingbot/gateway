import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Hydration } from '../hydration';
import { Polkadot } from '../../../chains/polkadot/polkadot';
import { logger } from '../../../services/logger';
import { 
  RemoveLiquidityRequest, 
  RemoveLiquidityResponse, 
  RemoveLiquidityRequestType, 
  RemoveLiquidityResponseType 
} from '../../../services/clmm-interfaces';
import { httpBadRequest, httpNotFound } from '../../../services/error-handler';

/**
 * Remove liquidity from a position
 */
export async function removeLiquidity(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
  percentageToRemove: number
): Promise<RemoveLiquidityResponseType> {
  try {
    // Validate inputs
    if (percentageToRemove <= 0 || percentageToRemove > 100) {
      throw httpBadRequest('Percentage to remove must be between 0 and 100');
    }

    const polkadot = await Polkadot.getInstance(network);
    const hydration = await Hydration.getInstance(network);
    
    // Get wallet
    const wallet = await polkadot.getWallet(walletAddress);
    
    // Remove liquidity
    const result = await hydration.removeLiquidity(
      wallet,
      positionAddress,
      percentageToRemove
    );
    
    logger.info(`Removed ${percentageToRemove}% liquidity from position ${positionAddress}`);
    
    return {
      signature: result.signature,
      fee: result.fee,
      baseTokenAmountRemoved: result.baseTokenAmountRemoved,
      quoteTokenAmountRemoved: result.quoteTokenAmountRemoved
    };
  } catch (error) {
    logger.error(`Failed to remove liquidity: ${error.message}`);
    if (error.statusCode) throw error;
    if (error.message.includes('not found')) {
      throw httpNotFound(error.message);
    }
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

  fastify.post<{
    Body: RemoveLiquidityRequestType;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Hydration position',
        tags: ['hydration'],
        body: {
          ...RemoveLiquidityRequest,
          properties: {
            ...RemoveLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            positionAddress: { type: 'string', examples: ['hydration-position-0'] },
            percentageToRemove: { type: 'number', examples: [50] }
          }
        },
        response: {
          200: RemoveLiquidityResponse
        },
      }
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress, percentageToRemove } = request.body;
        const networkToUse = network || 'mainnet';
        
        return await removeLiquidity(
          fastify,
          networkToUse,
          walletAddress,
          positionAddress,
          percentageToRemove
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, e.message || 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default removeLiquidityRoute;


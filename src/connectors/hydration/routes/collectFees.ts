import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Hydration } from '../hydration';
import { Polkadot } from '../../../chains/polkadot/polkadot';
import { logger } from '../../../services/logger';
import { 
  CollectFeesRequest, 
  CollectFeesResponse, 
  CollectFeesRequestType, 
  CollectFeesResponseType 
} from '../../../services/clmm-interfaces';
import { httpNotFound } from '../../../services/error-handler';

/**
 * Collect fees from a position
 */
export async function collectFees(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string
): Promise<CollectFeesResponseType> {
  try {
    const polkadot = await Polkadot.getInstance(network);
    const hydration = await Hydration.getInstance(network);
    
    // Get wallet
    const wallet = await polkadot.getWallet(walletAddress);
    
    // Collect fees
    const result = await hydration.collectFees(
      wallet,
      positionAddress
    );
    
    logger.info(`Collected fees from position ${positionAddress}: ${result.baseFeeAmountCollected.toFixed(4)} base token, ${result.quoteFeeAmountCollected.toFixed(4)} quote token`);
    
    return {
      signature: result.signature,
      fee: result.fee,
      baseFeeAmountCollected: result.baseFeeAmountCollected,
      quoteFeeAmountCollected: result.quoteFeeAmountCollected
    };
  } catch (error) {
    logger.error(`Failed to collect fees: ${error.message}`);
    if (error.statusCode) throw error;
    if (error.message.includes('not found')) {
      throw httpNotFound(error.message);
    }
    throw error;
  }
}

/**
 * Route handler for collecting fees
 */
export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
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
  CollectFeesRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.post<{
    Body: CollectFeesRequestType;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees from a Hydration position',
        tags: ['hydration'],
        body: {
          ...CollectFeesRequest,
          properties: {
            ...CollectFeesRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            positionAddress: { type: 'string', examples: ['hydration-position-0'] }
          }
        },
        response: {
          200: CollectFeesResponse
        },
      }
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress } = request.body;
        const networkToUse = network || 'mainnet';
        
        return await collectFees(
          fastify,
          networkToUse,
          walletAddress,
          positionAddress
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

export default collectFeesRoute;


import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Hydration } from '../hydration';
import { Polkadot } from '../../../chains/polkadot/polkadot';
import { logger } from '../../../services/logger';
import { removeLiquidity } from './removeLiquidity';
import { collectFees } from './collectFees';
import { 
  ClosePositionRequest, 
  ClosePositionResponse, 
  ClosePositionRequestType, 
  ClosePositionResponseType,
  CollectFeesResponseType,
  RemoveLiquidityResponseType
} from '../../../services/clmm-interfaces';
import { httpNotFound } from '../../../services/error-handler';

/**
 * Close a position
 */
async function closePosition(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string
): Promise<ClosePositionResponseType> {
  try {
    const polkadot = await Polkadot.getInstance(network);    
    const hydration = await Hydration.getInstance(network);
    
    // Get wallet
    const wallet = await polkadot.getWallet(walletAddress);
    
    // Get position info
    const positionInfo = await hydration.getPositionInfo(positionAddress, wallet);
    logger.info('Position Info:', positionInfo);

    // Remove liquidity if baseTokenAmount or quoteTokenAmount is greater than 0
    const removeLiquidityResult = (positionInfo.baseTokenAmount > 0 || positionInfo.quoteTokenAmount > 0)
      ? await removeLiquidity(fastify, network, walletAddress, positionAddress, 100) as RemoveLiquidityResponseType
      : { baseTokenAmountRemoved: 0, quoteTokenAmountRemoved: 0, fee: 0 };

    // Collect fees if baseFeeAmount or quoteFeeAmount is greater than 0
    const collectFeesResult = (positionInfo.baseFeeAmount > 0 || positionInfo.quoteFeeAmount > 0)
      ? await collectFees(fastify, network, walletAddress, positionAddress) as CollectFeesResponseType
      : { baseFeeAmountCollected: 0, quoteFeeAmountCollected: 0, fee: 0 };

    // Close the position
    const closeResult = await hydration.closePosition(
      wallet,
      positionAddress
    );
    
    logger.info(`Closed position ${positionAddress}`);
    
    return {
      signature: closeResult.signature,
      fee: closeResult.fee,
      positionRentRefunded: closeResult.positionRentRefunded,
      baseTokenAmountRemoved: removeLiquidityResult.baseTokenAmountRemoved,
      quoteTokenAmountRemoved: removeLiquidityResult.quoteTokenAmountRemoved,
      baseFeeAmountCollected: collectFeesResult.baseFeeAmountCollected,
      quoteFeeAmountCollected: collectFeesResult.quoteFeeAmountCollected
    };
  } catch (error) {
    logger.error(`Failed to close position: ${error.message}`);
    if (error.statusCode) throw error;
    if (error.message.includes('not found')) {
      throw httpNotFound(error.message);
    }
    throw error;
  }
}

/**
 * Route handler for closing a position
 */
export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const polkadot = await Polkadot.getInstance('mainnet');
  let firstWalletAddress = '<polkadot-wallet-address>';
  
  const foundWallet = await polkadot.getFirstWalletAddress();
  if (foundWallet) {
    firstWalletAddress = foundWallet;
  } else {
    logger.info('No wallets found for examples in schema');
  }
  
  // Update schema example
  ClosePositionRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.post<{
    Body: ClosePositionRequestType;
    Reply: ClosePositionResponseType;
  }>(
    '/close-position',
    {
      schema: {
        description: 'Close a Hydration position',
        tags: ['hydration'],
        body: {
          ...ClosePositionRequest,
          properties: {
            ...ClosePositionRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            positionAddress: { type: 'string', examples: ['hydration-position-0'] }
          }
        },
        response: {
          200: ClosePositionResponse
        },
      }
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress } = request.body;
        const networkToUse = network || 'mainnet';
        
        return await closePosition(
          fastify,
          networkToUse,
          walletAddress,
          positionAddress
        );
      } catch (e) {
        logger.error('Close position route error:', {
          message: e.message || 'Unknown error',
          name: e.name,
          code: e.code,
          statusCode: e.statusCode,
          stack: e.stack,
          positionAddress: request.body.positionAddress,
          network: request.body.network,
          walletAddress: request.body.walletAddress
        });
        
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, e.message || 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default closePositionRoute;


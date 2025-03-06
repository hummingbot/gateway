import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
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

async function closePosition(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string
): Promise<ClosePositionResponseType> {
  try {
    const solana = await Solana.getInstance(network);    
    const meteora = await Meteora.getInstance(network);
    const wallet = await solana.getWallet(walletAddress);
    const positionInfo = await meteora.getPositionInfo(positionAddress, wallet.publicKey);
    logger.info('Position Info:', positionInfo);

    const dlmmPool = await meteora.getDlmmPool(positionInfo.poolAddress);

    // Remove liquidity if baseTokenAmount or quoteTokenAmount is greater than 0
    const removeLiquidityResult = (positionInfo.baseTokenAmount > 0 || positionInfo.quoteTokenAmount > 0)
      ? await removeLiquidity(fastify, network, walletAddress, positionAddress, 100) as RemoveLiquidityResponseType
      : { baseTokenAmountRemoved: 0, quoteTokenAmountRemoved: 0, fee: 0 };

    // Remove liquidity if baseTokenFees or quoteTokenFees is greater than 0
    const collectFeesResult = (positionInfo.baseFeeAmount > 0 || positionInfo.quoteFeeAmount > 0)
      ? await collectFees(fastify, network, walletAddress, positionAddress) as CollectFeesResponseType
      : { baseFeeAmountCollected: 0, quoteFeeAmountCollected: 0, fee: 0 };

    // Now close the position
    try {
      const { position } = await meteora.getRawPosition(positionAddress, wallet.publicKey);
      
      const closePositionTx = await dlmmPool.closePosition({
        owner: wallet.publicKey,
        position: position,
      });

      const { signature, fee } = await solana.sendAndConfirmTransaction(closePositionTx, [wallet], 200_000);
      logger.info(`Position ${positionAddress} closed successfully with signature: ${signature}`);

      const { balanceChange } = await solana.extractAccountBalanceChangeAndFee(signature, 0);
      const returnedSOL = Math.abs(balanceChange);

      return {
        signature,
        fee: fee + removeLiquidityResult.fee + collectFeesResult.fee,
        positionRentRefunded: returnedSOL,
        baseTokenAmountRemoved: removeLiquidityResult.baseTokenAmountRemoved,
        quoteTokenAmountRemoved: removeLiquidityResult.quoteTokenAmountRemoved,
        baseFeeAmountCollected: collectFeesResult.baseFeeAmountCollected,
        quoteFeeAmountCollected: collectFeesResult.quoteFeeAmountCollected,
      };
    } catch (positionError) {
      logger.error('Error in position closing workflow:', {
        message: positionError.message,
        code: positionError.code,
        name: positionError.name,
        step: 'Raw position handling',
        stack: positionError.stack
      });
      throw positionError;
    }
  } catch (error) {
    // Don't log the actual error object which may contain circular references
    logger.error('Close position error:', {
      message: error.message || 'Unknown error',
      name: error.name,
      code: error.code,
      stack: error.stack,
      positionAddress,
      network,
      walletAddress
    });
    throw error;
  }
}

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';
  
  const foundWallet = await solana.getFirstWalletAddress();
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
        description: 'Close a Meteora position',
        tags: ['meteora'],
        body: {
          ...ClosePositionRequest,
          properties: {
            ...ClosePositionRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            positionAddress: { type: 'string' }
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
        const networkToUse = network || 'mainnet-beta';
        
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
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default closePositionRoute; 
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
    logger.debug('Position Info:', positionInfo);

    const dlmmPool = await meteora.getDlmmPool(positionInfo.poolAddress);
    logger.debug('DLMM Pool:', dlmmPool);

    // Remove liquidity if baseTokenAmount or quoteTokenAmount is greater than 0
    const removeLiquidityResult = (positionInfo.baseTokenAmount > 0 || positionInfo.quoteTokenAmount > 0)
      ? await removeLiquidity(fastify, network, walletAddress, positionAddress, 100) as RemoveLiquidityResponseType
      : { baseTokenAmountRemoved: 0, quoteTokenAmountRemoved: 0, fee: 0 };

    // Remove liquidity if baseTokenFees or quoteTokenFees is greater than 0
    const collectFeesResult = (positionInfo.baseFeeAmount > 0 || positionInfo.quoteFeeAmount > 0)
      ? await collectFees(fastify, network, walletAddress, positionAddress) as CollectFeesResponseType
      : { baseFeeAmountCollected: 0, quoteFeeAmountCollected: 0, fee: 0 };

    // Now close the position
    logger.info(`Closing position ${positionAddress}`);
    const { position } = await meteora.getRawPosition(positionAddress, wallet.publicKey);
    logger.debug('Raw position data:', position);
    logger.debug('Creating close position transaction with params:', {
      owner: wallet.publicKey.toString(),
      position: position
    });

    const closePositionTx = await dlmmPool.closePosition({
      owner: wallet.publicKey,
      position: position,
    });

    logger.debug('Close position transaction created:', closePositionTx);

    const { signature, fee } = await solana.sendAndConfirmTransaction(closePositionTx, [wallet], 200_000);
    logger.info(`Position ${positionAddress} closed successfully.`);

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
  } catch (error) {
    logger.error('Close position error:', {
      error,
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
    logger.debug('No wallets found for examples in schema');
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
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default closePositionRoute; 
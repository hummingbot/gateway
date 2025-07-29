import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  ClosePositionResponse,
  ClosePositionRequestType,
  ClosePositionResponseType,
  CollectFeesResponseType,
  RemoveLiquidityResponseType,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmClosePositionRequest } from '../schemas';

import { collectFees } from './collectFees';
import { removeLiquidity } from './removeLiquidity';

async function closePosition(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<ClosePositionResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const meteora = await Meteora.getInstance(network);
    const wallet = await solana.getWallet(walletAddress);
    const positionInfo = await meteora.getPositionInfo(positionAddress, wallet.publicKey);

    const dlmmPool = await meteora.getDlmmPool(positionInfo.poolAddress);

    // Remove liquidity if baseTokenAmount or quoteTokenAmount is greater than 0
    const removeLiquidityResult =
      positionInfo.baseTokenAmount > 0 || positionInfo.quoteTokenAmount > 0
        ? ((await removeLiquidity(
            fastify,
            network,
            walletAddress,
            positionAddress,
            100,
          )) as RemoveLiquidityResponseType)
        : {
            signature: '',
            status: 1,
            data: {
              baseTokenAmountRemoved: 0,
              quoteTokenAmountRemoved: 0,
              fee: 0,
            },
          };

    // Remove liquidity if baseTokenFees or quoteTokenFees is greater than 0
    const collectFeesResult =
      positionInfo.baseFeeAmount > 0 || positionInfo.quoteFeeAmount > 0
        ? ((await collectFees(fastify, network, walletAddress, positionAddress)) as CollectFeesResponseType)
        : {
            signature: '',
            status: 1,
            data: {
              baseFeeAmountCollected: 0,
              quoteFeeAmountCollected: 0,
              fee: 0,
            },
          };

    // Now close the position
    try {
      const { position } = await meteora.getRawPosition(positionAddress, wallet.publicKey);

      const closePositionTx = await dlmmPool.closePosition({
        owner: wallet.publicKey,
        position: position,
      });

      // Sign the transaction
      closePositionTx.sign(wallet);

      const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(closePositionTx);

      if (confirmed && txData) {
        logger.info(`Position ${positionAddress} closed successfully with signature: ${signature}`);

        const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, wallet.publicKey.toBase58(), [
          'So11111111111111111111111111111111111111112',
        ]);
        const returnedSOL = Math.abs(balanceChanges[0]);
        const fee = txData.meta.fee / 1e9;

        const totalFee = fee + (removeLiquidityResult.data?.fee || 0) + (collectFeesResult.data?.fee || 0);

        return {
          signature,
          status: 1, // CONFIRMED
          data: {
            fee: totalFee,
            positionRentRefunded: returnedSOL,
            baseTokenAmountRemoved: removeLiquidityResult.data?.baseTokenAmountRemoved || 0,
            quoteTokenAmountRemoved: removeLiquidityResult.data?.quoteTokenAmountRemoved || 0,
            baseFeeAmountCollected: collectFeesResult.data?.baseFeeAmountCollected || 0,
            quoteFeeAmountCollected: collectFeesResult.data?.quoteFeeAmountCollected || 0,
          },
        };
      } else {
        return {
          signature,
          status: 0, // PENDING
        };
      }
    } catch (positionError) {
      logger.error('Error in position closing workflow:', {
        message: positionError.message,
        code: positionError.code,
        name: positionError.name,
        step: 'Raw position handling',
        stack: positionError.stack,
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
      walletAddress,
    });
    throw error;
  }
}

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: Static<typeof MeteoraClmmClosePositionRequest>;
    Reply: ClosePositionResponseType;
  }>(
    '/close-position',
    {
      schema: {
        description: 'Close a Meteora position',
        tags: ['/connector/meteora'],
        body: MeteoraClmmClosePositionRequest,
        response: {
          200: ClosePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress } = request.body;
        const networkToUse = network;

        return await closePosition(fastify, networkToUse, walletAddress, positionAddress);
      } catch (e) {
        logger.error('Close position route error:', {
          message: e.message || 'Unknown error',
          name: e.name,
          code: e.code,
          statusCode: e.statusCode,
          stack: e.stack,
          positionAddress: request.body.positionAddress,
          network: request.body.network,
          walletAddress: request.body.walletAddress,
        });

        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default closePositionRoute;

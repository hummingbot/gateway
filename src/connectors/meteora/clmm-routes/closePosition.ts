import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  ClosePositionRequest,
  ClosePositionResponse,
  ClosePositionRequestType,
  ClosePositionResponseType,
  CollectFeesResponseType,
  RemoveLiquidityResponseType,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';

import { collectFees } from './collectFees';
import { removeLiquidity } from './removeLiquidity';

async function closePosition(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
  priorityFeePerCU?: number,
  computeUnits?: number,
): Promise<ClosePositionResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const meteora = await Meteora.getInstance(network);
    const wallet = await solana.getWallet(walletAddress);
    const positionInfo = await meteora.getPositionInfo(
      positionAddress,
      wallet.publicKey,
    );
    logger.info('Position Info:', positionInfo);

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
            priorityFeePerCU,
            computeUnits,
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
        ? ((await collectFees(
            fastify,
            network,
            walletAddress,
            positionAddress,
            priorityFeePerCU,
            computeUnits,
          )) as CollectFeesResponseType)
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
      const { position } = await meteora.getRawPosition(
        positionAddress,
        wallet.publicKey,
      );

      const closePositionTx = await dlmmPool.closePosition({
        owner: wallet.publicKey,
        position: position,
      });

      // Use provided compute units or default
      const finalComputeUnits = computeUnits || 200_000;

      const { signature, fee } = await solana.sendAndConfirmTransaction(
        closePositionTx,
        [wallet],
        finalComputeUnits,
        priorityFeePerCU,
      );
      logger.info(
        `Position ${positionAddress} closed successfully with signature: ${signature}`,
      );

      const { balanceChange } = await solana.extractAccountBalanceChangeAndFee(
        signature,
        0,
      );
      const returnedSOL = Math.abs(balanceChange);

      const totalFee =
        fee +
        (removeLiquidityResult.data?.fee || 0) +
        (collectFeesResult.data?.fee || 0);

      return {
        signature,
        status: 1, // CONFIRMED
        data: {
          fee: totalFee,
          positionRentRefunded: returnedSOL,
          baseTokenAmountRemoved:
            removeLiquidityResult.data?.baseTokenAmountRemoved || 0,
          quoteTokenAmountRemoved:
            removeLiquidityResult.data?.quoteTokenAmountRemoved || 0,
          baseFeeAmountCollected:
            collectFeesResult.data?.baseFeeAmountCollected || 0,
          quoteFeeAmountCollected:
            collectFeesResult.data?.quoteFeeAmountCollected || 0,
        },
      };
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
        tags: ['meteora/clmm'],
        body: {
          ...ClosePositionRequest,
          properties: {
            ...ClosePositionRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            positionAddress: { type: 'string' },
          },
        },
        response: {
          200: ClosePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress,
          positionAddress,
          priorityFeePerCU,
          computeUnits,
        } = request.body;
        const networkToUse = network || 'mainnet-beta';

        return await closePosition(
          fastify,
          networkToUse,
          walletAddress,
          positionAddress,
          priorityFeePerCU,
          computeUnits,
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

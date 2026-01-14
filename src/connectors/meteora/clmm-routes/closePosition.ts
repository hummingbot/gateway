import { BN } from '@coral-xyz/anchor';
import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  ClosePositionResponse,
  ClosePositionRequestType,
  ClosePositionResponseType,
} from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmClosePositionRequest } from '../schemas';

export async function closePosition(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<ClosePositionResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const meteora = await Meteora.getInstance(network);
    const wallet = await solana.getWallet(walletAddress);

    // Get position and pool info
    const positionResult = await meteora.getRawPosition(positionAddress, wallet.publicKey);

    if (!positionResult || !positionResult.position) {
      throw httpErrors.notFound(`Position not found: ${positionAddress}. Please provide a valid position address`);
    }

    const { position, info } = positionResult;
    const dlmmPool = await meteora.getDlmmPool(info.publicKey.toBase58());
    const tokenX = await solana.getToken(dlmmPool.tokenX.publicKey.toBase58());
    const tokenY = await solana.getToken(dlmmPool.tokenY.publicKey.toBase58());
    const tokenXSymbol = tokenX?.symbol || 'UNKNOWN';
    const tokenYSymbol = tokenY?.symbol || 'UNKNOWN';

    // Get position info to track fees separately
    const positionInfo = await meteora.getPositionInfo(positionAddress, wallet.publicKey);
    const baseFeeAmount = positionInfo.baseFeeAmount;
    const quoteFeeAmount = positionInfo.quoteFeeAmount;

    logger.info(`Closing position ${positionAddress} (removing 100% liquidity, collecting fees, and closing)`);

    // Use SDK's shouldClaimAndClose to remove liquidity, collect fees, and close position in one call
    // Set bps to 10000 (100%) to remove all liquidity
    const bps = new BN(10000);
    const fromBinId = position.positionData.lowerBinId;
    const toBinId = position.positionData.upperBinId;

    const removeLiquidityTxs = await dlmmPool.removeLiquidity({
      position: position.publicKey,
      user: wallet.publicKey,
      fromBinId,
      toBinId,
      bps: bps,
      shouldClaimAndClose: true, // This will remove liquidity, claim fees, and close position
    });

    // Handle both single transaction and array of transactions
    const transactions = Array.isArray(removeLiquidityTxs) ? removeLiquidityTxs : [removeLiquidityTxs];

    let totalFee = 0;
    let lastSignature = '';

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      if (transactions.length > 1) {
        logger.info(`Executing transaction ${i + 1} of ${transactions.length}`);
      }

      // Set fee payer for simulation
      tx.feePayer = wallet.publicKey;

      // Simulate with error handling
      await solana.simulateWithErrorHandling(tx);

      logger.info('Transaction simulated successfully, sending to network...');

      // Send and confirm transaction
      const result = await solana.sendAndConfirmTransaction(tx, [wallet]);
      totalFee += result.fee;
      lastSignature = result.signature;
    }

    const signature = lastSignature;

    // Get transaction data for confirmation
    const txData = await solana.connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    const confirmed = txData !== null;

    if (confirmed && txData) {
      logger.info(`Position ${positionAddress} closed successfully with signature: ${signature}`);

      // Extract balance changes for the tokens
      const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, wallet.publicKey.toBase58(), [
        dlmmPool.tokenX.publicKey.toBase58(),
        dlmmPool.tokenY.publicKey.toBase58(),
        'So11111111111111111111111111111111111111112', // SOL (for rent refund)
      ]);

      const totalTokenXReceived = Math.abs(balanceChanges[0]);
      const totalTokenYReceived = Math.abs(balanceChanges[1]);
      const returnedSOL = Math.abs(balanceChanges[2]);

      // Separate fees from liquidity amounts
      // Total received = liquidity removed + fees collected
      const baseTokenAmountRemoved = Math.max(0, totalTokenXReceived - baseFeeAmount);
      const quoteTokenAmountRemoved = Math.max(0, totalTokenYReceived - quoteFeeAmount);

      logger.info(
        `Position closed: ${baseTokenAmountRemoved.toFixed(4)} ${tokenXSymbol} + ${baseFeeAmount.toFixed(4)} ${tokenXSymbol} fees, ${quoteTokenAmountRemoved.toFixed(4)} ${tokenYSymbol} + ${quoteFeeAmount.toFixed(4)} ${tokenYSymbol} fees, ${returnedSOL.toFixed(9)} SOL rent refunded`,
      );

      return {
        signature,
        status: 1, // CONFIRMED
        data: {
          fee: totalFee,
          positionRentRefunded: returnedSOL,
          baseTokenAmountRemoved,
          quoteTokenAmountRemoved,
          baseFeeAmountCollected: baseFeeAmount,
          quoteFeeAmountCollected: quoteFeeAmount,
        },
      };
    } else {
      return {
        signature,
        status: 0, // PENDING
      };
    }
  } catch (error) {
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

        return await closePosition(networkToUse, walletAddress, positionAddress);
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
          throw e; // Re-throw HttpErrors with original message
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default closePositionRoute;

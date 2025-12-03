import { BN } from '@coral-xyz/anchor';
import { Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  RemoveLiquidityResponse,
  RemoveLiquidityRequestType,
  RemoveLiquidityResponseType,
} from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmRemoveLiquidityRequest } from '../schemas';

// Using centralized error handling
const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) => `Invalid Solana address: ${address}`;

export async function removeLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  percentageToRemove: number,
): Promise<RemoveLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const wallet = await solana.getWallet(walletAddress);

  try {
    new PublicKey(positionAddress);
    new PublicKey(walletAddress);
  } catch (error) {
    const invalidAddress = error.message.includes(positionAddress) ? 'position' : 'wallet';
    throw httpErrors.badRequest(INVALID_SOLANA_ADDRESS_MESSAGE(invalidAddress));
  }

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

  logger.info(`Removing ${percentageToRemove.toFixed(4)}% liquidity from position ${positionAddress}`);
  const bps = new BN(percentageToRemove * 100);

  // SDK v1.7.5 uses fromBinId and toBinId instead of binIds array
  const fromBinId = position.positionData.lowerBinId;
  const toBinId = position.positionData.upperBinId;

  const removeLiquidityTx = await dlmmPool.removeLiquidity({
    position: position.publicKey,
    user: wallet.publicKey,
    fromBinId,
    toBinId,
    bps: bps,
    shouldClaimAndClose: false,
  });

  // Handle both single transaction and array of transactions (SDK v1.7.5 may return either)
  const transactions = Array.isArray(removeLiquidityTx) ? removeLiquidityTx : [removeLiquidityTx];

  let totalFee = 0;
  let lastSignature = '';

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (transactions.length > 1) {
      logger.info(`Executing transaction ${i + 1} of ${transactions.length}`);
    }

    // Set fee payer for simulation
    tx.feePayer = wallet.publicKey;

    // Simulate before sending
    await solana.simulateWithErrorHandling(tx);

    logger.info('Transaction simulated successfully, sending to network...');

    const result = await solana.sendAndConfirmTransaction(tx, [wallet]);
    totalFee += result.fee;
    lastSignature = result.signature;
  }

  const signature = lastSignature;
  const fee = totalFee;

  // Get transaction data for confirmation
  const txData = await solana.connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  const confirmed = txData !== null;

  if (confirmed && txData) {
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, wallet.publicKey.toBase58(), [
      dlmmPool.tokenX.publicKey.toBase58(),
      dlmmPool.tokenY.publicKey.toBase58(),
    ]);

    const tokenXRemovedAmount = balanceChanges[0];
    const tokenYRemovedAmount = balanceChanges[1];

    logger.info(
      `Liquidity removed from position ${positionAddress}: ${Math.abs(tokenXRemovedAmount).toFixed(4)} ${tokenXSymbol}, ${Math.abs(tokenYRemovedAmount).toFixed(4)} ${tokenYSymbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee,
        baseTokenAmountRemoved: Math.abs(tokenXRemovedAmount),
        quoteTokenAmountRemoved: Math.abs(tokenYRemovedAmount),
      },
    };
  } else {
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: Static<typeof MeteoraClmmRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Meteora position',
        tags: ['/connector/meteora'],
        body: MeteoraClmmRemoveLiquidityRequest,
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress, liquidityPct } = request.body;

        const networkToUse = network;

        return await removeLiquidity(networkToUse, walletAddress, positionAddress, liquidityPct);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default removeLiquidityRoute;

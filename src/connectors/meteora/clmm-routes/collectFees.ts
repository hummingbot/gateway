import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { CollectFeesResponse, CollectFeesRequestType, CollectFeesResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmCollectFeesRequest } from '../schemas';

export async function collectFees(
  network: string,
  address: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const wallet = await solana.getWallet(address);

  // Get position result and check if it's null before destructuring
  const positionResult = await meteora.getRawPosition(positionAddress, wallet.publicKey);

  if (!positionResult || !positionResult.position) {
    throw httpErrors.notFound(`Position not found: ${positionAddress}. Please provide a valid position address`);
  }

  // Now safely destructure
  const { position, info } = positionResult;

  const dlmmPool = await meteora.getDlmmPool(info.publicKey.toBase58());
  if (!dlmmPool) {
    throw httpErrors.notFound(`Pool not found for position: ${positionAddress}`);
  }

  const tokenX = await solana.getToken(dlmmPool.tokenX.publicKey.toBase58());
  const tokenY = await solana.getToken(dlmmPool.tokenY.publicKey.toBase58());
  const tokenXSymbol = tokenX?.symbol || 'UNKNOWN';
  const tokenYSymbol = tokenY?.symbol || 'UNKNOWN';

  logger.info(`Collecting fees from position ${positionAddress}`);

  const claimSwapFeeTxs = await dlmmPool.claimSwapFee({
    owner: wallet.publicKey,
    position: position,
  });

  // Handle array of transactions (SDK v1.7.5 returns Transaction[])
  const transactions = Array.isArray(claimSwapFeeTxs) ? claimSwapFeeTxs : [claimSwapFeeTxs];

  // Set fee payer for all transactions
  transactions.forEach((tx) => {
    tx.feePayer = wallet.publicKey;
  });

  // Simulate and send all transactions
  let totalFee = 0;
  let lastSignature = '';

  for (const tx of transactions) {
    // Simulate with error handling
    await solana.simulateWithErrorHandling(tx);

    logger.info('Transaction simulated successfully, sending to network...');

    // Send and confirm transaction using sendAndConfirmTransaction which handles signing
    const { signature, fee } = await solana.sendAndConfirmTransaction(tx, [wallet]);
    lastSignature = signature;
    totalFee += fee;
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

    const collectedFeeX = balanceChanges[0];
    const collectedFeeY = balanceChanges[1];

    logger.info(
      `Fees collected from position ${positionAddress}: ${Math.abs(collectedFeeX).toFixed(4)} ${tokenXSymbol}, ${Math.abs(collectedFeeY).toFixed(4)} ${tokenYSymbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee,
        baseFeeAmountCollected: Math.abs(collectedFeeX),
        quoteFeeAmountCollected: Math.abs(collectedFeeY),
      },
    };
  } else {
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: Static<typeof MeteoraClmmCollectFeesRequest>;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees from a Meteora position',
        tags: ['/connector/meteora'],
        body: MeteoraClmmCollectFeesRequest,
        response: {
          200: CollectFeesResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress } = request.body;
        const networkToUse = network;

        return await collectFees(networkToUse, walletAddress, positionAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default collectFeesRoute;

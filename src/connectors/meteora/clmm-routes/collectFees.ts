import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { CollectFeesResponse, CollectFeesRequestType, CollectFeesResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmCollectFeesRequest } from '../schemas';

export async function collectFees(
  fastify: FastifyInstance,
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
    throw fastify.httpErrors.notFound(
      `Position not found: ${positionAddress}. Please provide a valid position address`,
    );
  }

  // Now safely destructure
  const { position, info } = positionResult;

  const dlmmPool = await meteora.getDlmmPool(info.publicKey.toBase58());
  if (!dlmmPool) {
    throw fastify.httpErrors.notFound(`Pool not found for position: ${positionAddress}`);
  }

  const tokenX = await solana.getToken(dlmmPool.tokenX.publicKey.toBase58());
  const tokenY = await solana.getToken(dlmmPool.tokenY.publicKey.toBase58());
  const tokenXSymbol = tokenX?.symbol || 'UNKNOWN';
  const tokenYSymbol = tokenY?.symbol || 'UNKNOWN';

  logger.info(`Collecting fees from position ${positionAddress}`);

  const claimSwapFeeTx = await dlmmPool.claimSwapFee({
    owner: wallet.publicKey,
    position: position,
  });

  let signature: string;
  let fee: number;

  logger.info(`Received ${claimSwapFeeTx.length} transactions for collecting fees`);

  let totalFee = 0;
  let lastSignature: string;
  const signatures: string[] = [];

  for (let i = 0; i < claimSwapFeeTx.length; i++) {
    const tx = claimSwapFeeTx[i];

    // Set fee payer for simulation
    tx.feePayer = wallet.publicKey;

    // Simulate with error handling
    await solana.simulateWithErrorHandling(tx, fastify);

    logger.info('Transaction simulated successfully, sending to network...');

    // Send and confirm transaction using sendAndConfirmTransaction which handles signing
    const result = await solana.sendAndConfirmTransaction(tx, [wallet]);
    totalFee += result.fee;
    signatures.push(result.signature);

    lastSignature = result.signature;
  }

  fee = totalFee;
  signature = lastSignature;

  // Get transaction data for confirmation
  const txsData = await Promise.all(
    signatures.map((signature) =>
      solana.connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      }),
    ),
  );

  const confirmed = txsData.every((txData) => txData !== null);

  if (confirmed) {
    const balancesChanges = await Promise.all(
      signatures.map((signature) =>
        solana.extractBalanceChangesAndFee(signature, dlmmPool.pubkey.toBase58(), [
          dlmmPool.tokenX.publicKey.toBase58(),
          dlmmPool.tokenY.publicKey.toBase58(),
        ]),
      ),
    );

    const collectedFeeX = balancesChanges.reduce((acc, { balanceChanges }) => acc + balanceChanges[0], 0);
    const collectedFeeY = balancesChanges.reduce((acc, { balanceChanges }) => acc + balanceChanges[1], 0);

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

        return await collectFees(fastify, networkToUse, walletAddress, positionAddress);
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

export default collectFeesRoute;

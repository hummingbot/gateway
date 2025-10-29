import { BN } from '@coral-xyz/anchor';
import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  RemoveLiquidityResponse,
  RemoveLiquidityRequestType,
  RemoveLiquidityResponseType,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmRemoveLiquidityRequest } from '../schemas';

// Using Fastify's native error handling
const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) => `Invalid Solana address: ${address}`;
import { PublicKey } from '@solana/web3.js';

export async function removeLiquidity(
  fastify: FastifyInstance,
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
    throw fastify.httpErrors.badRequest(INVALID_SOLANA_ADDRESS_MESSAGE(invalidAddress));
  }

  const positionResult = await meteora.getRawPosition(positionAddress, wallet.publicKey);

  if (!positionResult || !positionResult.position) {
    throw fastify.httpErrors.notFound(
      `Position not found: ${positionAddress}. Please provide a valid position address`,
    );
  }

  const { position, info } = positionResult;
  const dlmmPool = await meteora.getDlmmPool(info.publicKey.toBase58());
  const tokenX = await solana.getToken(dlmmPool.tokenX.publicKey.toBase58());
  const tokenY = await solana.getToken(dlmmPool.tokenY.publicKey.toBase58());
  const tokenXSymbol = tokenX?.symbol || 'UNKNOWN';
  const tokenYSymbol = tokenY?.symbol || 'UNKNOWN';

  logger.info(`Removing ${percentageToRemove.toFixed(4)}% liquidity from position ${positionAddress}`);
  const bps = new BN(percentageToRemove * 100);

  const removeLiquidityTx = await dlmmPool.removeLiquidity({
    position: position.publicKey,
    user: wallet.publicKey,
    fromBinId: position.positionData.lowerBinId,
    toBinId: position.positionData.upperBinId,
    bps: bps,
    shouldClaimAndClose: false,
  });

  let signature: string;
  let fee: number;

  // If multiple transactions are returned, execute them in sequence
  logger.info(`Received ${removeLiquidityTx.length} transactions for removing liquidity`);

  let totalFee = 0;
  let lastSignature: string;
  const signatures: string[] = [];

  for (let i = 0; i < removeLiquidityTx.length; i++) {
    const tx = removeLiquidityTx[i];
    logger.info(`Executing transaction ${i + 1} of ${removeLiquidityTx.length}`);

    // Set fee payer for simulation
    tx.feePayer = wallet.publicKey;

    // Simulate before sending
    await solana.simulateWithErrorHandling(tx, fastify);

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

    const tokenXRemovedAmount = balancesChanges.reduce((acc, { balanceChanges }) => acc + balanceChanges[0], 0);
    const tokenYRemovedAmount = balancesChanges.reduce((acc, { balanceChanges }) => acc + balanceChanges[1], 0);

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

        return await removeLiquidity(fastify, networkToUse, walletAddress, positionAddress, liquidityPct);
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

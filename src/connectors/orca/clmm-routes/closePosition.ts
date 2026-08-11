import { closePositionInstructions } from '@orca-so/whirlpools';
import { fetchMaybePosition, fetchWhirlpool } from '@orca-so/whirlpools-client';
import { Static } from '@sinclair/typebox';
import { address } from '@solana/kit';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { fetchMint } from '@solana-program/token-2022';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { ClosePositionResponse, ClosePositionResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { buildOrcaTransaction, createOrcaAuthority } from '../orca.sdk';
import { extractInnerTransferAmounts } from '../orca.utils';
import { OrcaClmmClosePositionRequest } from '../schemas';

const MAX_CLOSE_ATTEMPTS = 3;
type ExistingPositionAccount = Extract<Awaited<ReturnType<typeof fetchMaybePosition>>, { exists: true }>;

const extractTransactionSignature = (error: unknown): string | null => {
  const explicitSignature = (error as { transactionSignature?: unknown })?.transactionSignature;
  if (typeof explicitSignature === 'string') return explicitSignature;

  const message = error instanceof Error ? error.message : String(error);
  return message.match(/\bTransaction ([1-9A-HJ-NP-Za-km-z]{64,88})\b/)?.[1] ?? null;
};

export async function closePosition(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<ClosePositionResponseType> {
  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const positionPubkey = new PublicKey(positionAddress);

  const initialPosition = await fetchMaybePosition(orca.solanaKitRpc, address(positionAddress));
  if (!initialPosition.exists) {
    throw httpErrors.notFound(`Position not found: ${positionAddress}`);
  }
  let position: ExistingPositionAccount = initialPosition;

  let whirlpool: any;
  let positionMint: any;
  let hasLiquidity = false;
  let signature = '';
  let fee = 0;
  let reconciledTxData: any = null;

  for (let attempt = 1; attempt <= MAX_CLOSE_ATTEMPTS; attempt++) {
    try {
      [whirlpool, positionMint] = await Promise.all([
        fetchWhirlpool(orca.solanaKitRpc, position.data.whirlpool),
        fetchMint(orca.solanaKitRpc, position.data.positionMint),
      ]);
      hasLiquidity = position.data.liquidity > 0n;

      // Rebuild on every attempt so the quote, token minimums, and blockhash are
      // based on current state rather than resending a stale serialized transaction.
      const closeResult = await closePositionInstructions(orca.solanaKitRpc, position.data.positionMint, {
        authority: createOrcaAuthority(walletAddress),
        slippageToleranceBps: Math.round(orca.config.slippagePct * 100),
        whirlpoolDeployment: orca.deployment,
      });
      const rewardCount = closeResult.rewardsQuote.rewards.filter((reward) => reward.rewardsOwed > 0n).length;
      logger.info(
        `Built Orca close transaction (attempt ${attempt}/${MAX_CLOSE_ATTEMPTS}) with ` +
          `${rewardCount} reward collection instruction(s)`,
      );

      const transaction = buildOrcaTransaction(closeResult.instructions, walletAddress);
      ({ signature, fee } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress));
      break;
    } catch (error) {
      let refreshedPosition;
      try {
        refreshedPosition = await fetchMaybePosition(orca.solanaKitRpc, address(positionAddress));
      } catch (verificationError) {
        logger.warn(
          `Could not verify Orca position ${positionAddress} after close attempt ${attempt}: ` +
            `${(verificationError as Error).message}`,
        );
      }

      if (refreshedPosition && !refreshedPosition.exists) {
        const attemptedSignature = signature || extractTransactionSignature(error);
        if (!attemptedSignature) {
          logger.warn(`Orca position ${positionAddress} is closed, but its transaction signature is unavailable`);
          throw error;
        }

        try {
          reconciledTxData = await solana.connection.getTransaction(attemptedSignature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          });
        } catch (reconciliationError) {
          logger.warn(
            `Could not fetch reconciled Orca close transaction ${attemptedSignature}: ` +
              `${(reconciliationError as Error).message}`,
          );
        }

        if (reconciledTxData?.meta?.err) {
          // This attempt did not close the position; do not report its failed
          // signature as successful if another actor closed it concurrently.
          throw error;
        }

        signature = attemptedSignature;
        fee = Number(reconciledTxData?.meta?.fee ?? 0) / 1e9;
        logger.info(`Orca position ${positionAddress} is already closed; reconciled transaction ${signature}`);
        break;
      }

      if (attempt === MAX_CLOSE_ATTEMPTS) {
        throw error;
      }

      if (refreshedPosition?.exists) {
        position = refreshedPosition;
      }
      logger.warn(
        `Orca close attempt ${attempt}/${MAX_CLOSE_ATTEMPTS} failed for ${positionAddress}; ` +
          'rebuilding and retrying immediately',
      );
    }
  }

  let baseTokenAmountRemoved = 0;
  let quoteTokenAmountRemoved = 0;
  let baseFeeAmountCollected = 0;
  let quoteFeeAmountCollected = 0;
  let txData = reconciledTxData;
  if (!txData) {
    try {
      txData = await solana.connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
    } catch (error) {
      // The close is already confirmed by the shared send path. Transaction
      // details only enrich the response and must not cause another close.
      logger.warn(`Could not fetch Orca close transaction ${signature}: ${(error as Error).message}`);
    }
  }
  let positionRentRefunded = 0;

  if (txData) {
    const accountKeys = txData.transaction.message.getAccountKeys().staticAccountKeys;
    const preBalances = txData.meta?.preBalances || [];
    const postBalances = txData.meta?.postBalances || [];
    const positionMintPubkey = new PublicKey(position.data.positionMint);
    const positionTokenAccount = getAssociatedTokenAddressSync(
      positionMintPubkey,
      new PublicKey(walletAddress),
      false,
      new PublicKey(positionMint.programAddress),
    );
    const rentAccounts = [positionMintPubkey, positionPubkey, positionTokenAccount];

    let totalRentLamports = 0;
    for (const pubkey of rentAccounts) {
      const index = accountKeys.findIndex((key) => key.equals(pubkey));
      if (index !== -1 && postBalances[index] === 0 && preBalances[index] > 0) {
        totalRentLamports += preBalances[index];
        logger.info(`Rent refunded from ${pubkey.toString()}: ${preBalances[index]} lamports`);
      }
    }
    positionRentRefunded = totalRentLamports / 1e9;

    // Reward transfers use their own mints and are excluded by this filter.
    const { transferGroups } = await extractInnerTransferAmounts(
      solana.connection,
      signature,
      orca.deployment.programId.toString(),
      [whirlpool.data.tokenMintA.toString(), whirlpool.data.tokenMintB.toString()],
    );

    if (transferGroups.length >= 2) {
      [baseTokenAmountRemoved, quoteTokenAmountRemoved] = transferGroups[0];
      [baseFeeAmountCollected, quoteFeeAmountCollected] = transferGroups[1];
    } else if (transferGroups.length === 1) {
      if (hasLiquidity) {
        [baseTokenAmountRemoved, quoteTokenAmountRemoved] = transferGroups[0];
      } else {
        [baseFeeAmountCollected, quoteFeeAmountCollected] = transferGroups[0];
      }
    }
  }

  logger.info(
    `Position closed: removed=${baseTokenAmountRemoved.toFixed(6)} tokenA + ${quoteTokenAmountRemoved.toFixed(6)} tokenB, ` +
      `fees=${baseFeeAmountCollected.toFixed(6)} tokenA + ${quoteFeeAmountCollected.toFixed(6)} tokenB, ` +
      `rent refunded=${positionRentRefunded.toFixed(6)} SOL`,
  );

  return {
    signature,
    status: 1,
    data: {
      fee,
      positionRentRefunded,
      baseTokenAmountRemoved,
      quoteTokenAmountRemoved,
      baseFeeAmountCollected,
      quoteFeeAmountCollected,
    },
  };
}

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof OrcaClmmClosePositionRequest>;
    Reply: ClosePositionResponseType;
  }>(
    '/close-position',
    {
      schema: {
        description: 'Close an Orca position',
        tags: ['/connector/orca'],
        body: OrcaClmmClosePositionRequest,
        response: {
          200: ClosePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { walletAddress, positionAddress, network } = request.body;
        return await closePosition(network, walletAddress, positionAddress);
      } catch (error) {
        logger.error(error);
        if (error.statusCode) throw error;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default closePositionRoute;

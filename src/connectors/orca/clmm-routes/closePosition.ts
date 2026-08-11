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

export async function closePosition(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<ClosePositionResponseType> {
  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const positionPubkey = new PublicKey(positionAddress);

  const position = await fetchMaybePosition(orca.solanaKitRpc, address(positionAddress));
  if (!position.exists) {
    throw httpErrors.notFound(`Position not found: ${positionAddress}`);
  }
  const [whirlpool, positionMint] = await Promise.all([
    fetchWhirlpool(orca.solanaKitRpc, position.data.whirlpool),
    fetchMint(orca.solanaKitRpc, position.data.positionMint),
  ]);

  const hasLiquidity = position.data.liquidity > 0n;
  let baseTokenAmountRemoved = 0;
  let quoteTokenAmountRemoved = 0;
  let baseFeeAmountCollected = 0;
  let quoteFeeAmountCollected = 0;

  // Orca v8 builds the complete close flow: liquidity removal, token fees,
  // every non-zero reward, the correct classic/Token-2022 close instruction,
  // and destination account setup/cleanup. Gateway remains the only signer.
  const closeResult = await closePositionInstructions(orca.solanaKitRpc, position.data.positionMint, {
    authority: createOrcaAuthority(walletAddress),
    slippageToleranceBps: Math.round(orca.config.slippagePct * 100),
    whirlpoolDeployment: orca.deployment,
  });
  const rewardCount = closeResult.rewardsQuote.rewards.filter((reward) => reward.rewardsOwed > 0n).length;
  logger.info(`Built Orca close transaction with ${rewardCount} reward collection instruction(s)`);

  const transaction = buildOrcaTransaction(closeResult.instructions, walletAddress);
  const { signature, fee } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);

  const txData = await solana.connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
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

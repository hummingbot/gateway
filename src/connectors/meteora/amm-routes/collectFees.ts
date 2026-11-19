import { getUnClaimLpFee } from '@meteora-ag/cp-amm-sdk';
import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
import { AmmCollectFeesResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { MeteoraDamm } from '../meteora-damm';

/**
 * Collect a DAMM v2 position's trading fees into the wallet (`claim_position_fee`),
 * leaving its liquidity in place. Refused when the position has no fees to collect,
 * rather than paying a transaction fee to move zero.
 */
export async function collectFees(
  network: string,
  walletAddress: string,
  poolAddress: string,
  positionAddress: string,
): Promise<AmmCollectFeesResponseType> {
  const solana = await Solana.getInstance(network);
  const meteoraDamm = await MeteoraDamm.getInstance(network);

  const poolState = await meteoraDamm.getPoolState(poolAddress);
  const { tokenAProgram, tokenBProgram } = meteoraDamm.getTokenPrograms(poolState);

  // getUserPositions is owner-filtered, so finding the position here also proves the
  // wallet owns it and that it belongs to this pool.
  const positions = await meteoraDamm.getUserPositions(poolAddress, walletAddress);
  const target = positions.find((p) => p.position.toBase58() === positionAddress);
  if (!target) {
    throw httpErrors.notFound(
      `Position ${positionAddress} not found for wallet in pool ${poolAddress}. ` +
        'List the wallet positions with position-info.',
    );
  }

  const { feeTokenA, feeTokenB } = getUnClaimLpFee(poolState, target.positionState);
  if (feeTokenA.isZero() && feeTokenB.isZero()) {
    throw httpErrors.badRequest(`Position ${positionAddress} has no fees to collect`);
  }

  logger.info(`Collecting fees of DAMM v2 position ${positionAddress} in pool ${poolAddress}`);

  const owner = new PublicKey(walletAddress);
  const transaction = await meteoraDamm.cpAmm.claimPositionFee({
    owner,
    pool: new PublicKey(poolAddress),
    position: target.position,
    positionNftAccount: target.positionNftAccount,
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAVault: poolState.tokenAVault,
    tokenBVault: poolState.tokenBVault,
    tokenAProgram,
    tokenBProgram,
    feePayer: owner,
  });

  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);
  if (!txData) {
    return { signature, status: 0 }; // PENDING
  }

  const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
    poolState.tokenAMint.toBase58(),
    poolState.tokenBMint.toBase58(),
  ]);
  return {
    signature,
    status: 1, // CONFIRMED
    data: {
      fee: txData.meta.fee / 1e9,
      poolAddress,
      positionAddress,
      baseFeeAmountCollected: Math.abs(balanceChanges[0]),
      quoteFeeAmountCollected: Math.abs(balanceChanges[1]),
    },
  };
}

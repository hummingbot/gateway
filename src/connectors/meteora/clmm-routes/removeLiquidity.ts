import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
import { RemoveLiquidityResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';

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

  try {
    new PublicKey(positionAddress);
  } catch {
    throw httpErrors.badRequest(`Invalid position address: ${positionAddress}`);
  }
  try {
    new PublicKey(walletAddress);
  } catch {
    throw httpErrors.badRequest(`Invalid wallet address: ${walletAddress}`);
  }

  // Build with the wallet's public key as authority — works for every wallet type
  // (local, hardware). Signing/sending is delegated to
  // sendAndConfirmTransactionForWallet, which knows how to sign for each type.
  const walletPublicKey = new PublicKey(walletAddress);

  const positionResult = await meteora.getRawPosition(positionAddress, walletPublicKey);

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
    user: walletPublicKey,
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
    tx.feePayer = walletPublicKey;

    // Sign + send via the wallet-type-aware chokepoint (handles local/hardware and
    // simulates internally).
    const result = await solana.sendAndConfirmTransactionForWallet(tx, walletAddress);
    totalFee += result.fee;
    lastSignature = result.signature;
  }

  const signature = lastSignature;
  const fee = totalFee;

  // Get transaction data for confirmation
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  const confirmed = txData !== null;

  if (confirmed && txData) {
    // Track wallet's balance changes for the tokens
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletPublicKey.toBase58(), [
      dlmmPool.tokenX.publicKey.toBase58(),
      dlmmPool.tokenY.publicKey.toBase58(),
    ]);

    // Balance changes are positive (tokens entering wallet)
    let tokenXRemovedAmount = Math.abs(balanceChanges[0]);
    let tokenYRemovedAmount = Math.abs(balanceChanges[1]);

    // When SOL is base/quote, wallet receives: liquidity - tx fee
    // Add back the fee to get actual liquidity removed
    if (tokenXSymbol === 'SOL') {
      tokenXRemovedAmount += fee;
    } else if (tokenYSymbol === 'SOL') {
      tokenYRemovedAmount += fee;
    }

    logger.info(
      `Liquidity removed from position ${positionAddress}: ${tokenXRemovedAmount.toFixed(4)} ${tokenXSymbol}, ${tokenYRemovedAmount.toFixed(4)} ${tokenYSymbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        // The pool this position belongs to, already loaded here. The unified route is
        // position-addressed and never receives it, so this is the only place it can
        // come from without a second lookup.
        poolAddress: info.publicKey.toBase58(),
        fee,
        baseTokenAmountRemoved: tokenXRemovedAmount,
        quoteTokenAmountRemoved: tokenYRemovedAmount,
      },
    };
  } else {
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

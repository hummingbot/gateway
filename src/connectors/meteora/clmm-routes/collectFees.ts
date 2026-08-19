import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
import { CollectFeesResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';

export async function collectFees(
  network: string,
  address: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  // Build with the wallet's public key as authority — works for every wallet type
  // (local, hardware). Signing/sending is delegated to
  // sendAndConfirmTransactionForWallet, which knows how to sign for each type.
  const walletPublicKey = new PublicKey(address);

  // Get position result and check if it's null before destructuring
  const positionResult = await meteora.getRawPosition(positionAddress, walletPublicKey);

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
    owner: walletPublicKey,
    position: position,
  });

  // Handle array of transactions (SDK v1.7.5 returns Transaction[])
  const transactions = Array.isArray(claimSwapFeeTxs) ? claimSwapFeeTxs : [claimSwapFeeTxs];

  // Set fee payer for all transactions
  transactions.forEach((tx) => {
    tx.feePayer = walletPublicKey;
  });

  // Send all transactions
  let totalFee = 0;
  let lastSignature = '';

  for (const tx of transactions) {
    // Sign + send via the wallet-type-aware chokepoint (handles local/hardware and
    // simulates internally).
    const { signature, fee } = await solana.sendAndConfirmTransactionForWallet(tx, address);
    lastSignature = signature;
    totalFee += fee;
  }

  const signature = lastSignature;
  const fee = totalFee;

  // Get transaction data for confirmation
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  const confirmed = txData !== null;

  if (confirmed && txData) {
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletPublicKey.toBase58(), [
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
        // The pool this position belongs to, already loaded here. The unified route is
        // position-addressed and never receives it, so this is the only place it can
        // come from without a second lookup.
        poolAddress: info.publicKey.toBase58(),
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

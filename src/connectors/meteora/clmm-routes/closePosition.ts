import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
import { ClosePositionResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';

export async function closePosition(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<ClosePositionResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const meteora = await Meteora.getInstance(network);
    // Build with the wallet's public key as authority — works for every wallet type
    // (local, hardware). Signing/sending is delegated to
    // sendAndConfirmTransactionForWallet, which knows how to sign for each type.
    const walletPublicKey = new PublicKey(walletAddress);

    // Get position and pool info
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

    // Get position info to track fees separately
    const positionInfo = await meteora.getPositionInfo(positionAddress, walletPublicKey);
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
      user: walletPublicKey,
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
      tx.feePayer = walletPublicKey;

      // Sign + send via the wallet-type-aware chokepoint (handles local/hardware and
      // simulates internally).
      const result = await solana.sendAndConfirmTransactionForWallet(tx, walletAddress);
      totalFee += result.fee;
      lastSignature = result.signature;
    }

    const signature = lastSignature;

    // Get transaction data for confirmation
    // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
    // landed with an error, so txData existing below really means "confirmed".
    const txData = await solana.getConfirmedTransactionData(signature);

    const confirmed = txData !== null;

    if (confirmed && txData) {
      logger.info(`Position ${positionAddress} closed successfully with signature: ${signature}`);

      // Extract position rent refunded from the position account's preBalance
      // When closing, the position account's lamports (rent) are returned to the wallet
      const positionPubkey = new PublicKey(positionAddress);
      const accountKeys = txData.transaction.message.getAccountKeys().staticAccountKeys;
      const preBalances = txData.meta?.preBalances || [];

      let positionRentRefunded = 0;
      const positionAccountIndex = accountKeys.findIndex((key) => key.equals(positionPubkey));
      if (positionAccountIndex !== -1) {
        // Position account's balance before closing IS the rent that gets refunded
        positionRentRefunded = preBalances[positionAccountIndex] / 1e9; // Convert lamports to SOL
      }

      // Track wallet's balance changes for the tokens
      const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletPublicKey.toBase58(), [
        dlmmPool.tokenX.publicKey.toBase58(),
        dlmmPool.tokenY.publicKey.toBase58(),
      ]);

      // Balance changes are positive (tokens entering wallet)
      let totalTokenXReceived = Math.abs(balanceChanges[0]);
      let totalTokenYReceived = Math.abs(balanceChanges[1]);

      // When SOL is base/quote, wallet balance change includes: liquidity + fees + rent refund - tx fee
      // We need to subtract rent refund to get actual token amounts
      if (tokenXSymbol === 'SOL') {
        // SOL is base token - subtract rent refund and add back tx fee
        totalTokenXReceived = totalTokenXReceived - positionRentRefunded + totalFee;
        if (totalTokenXReceived < 0) totalTokenXReceived = 0;
      } else if (tokenYSymbol === 'SOL') {
        // SOL is quote token - subtract rent refund and add back tx fee
        totalTokenYReceived = totalTokenYReceived - positionRentRefunded + totalFee;
        if (totalTokenYReceived < 0) totalTokenYReceived = 0;
      }

      // Separate fees from liquidity amounts
      // Total received (after rent adjustment) = liquidity removed + fees collected
      const baseTokenAmountRemoved = Math.max(0, totalTokenXReceived - baseFeeAmount);
      const quoteTokenAmountRemoved = Math.max(0, totalTokenYReceived - quoteFeeAmount);

      logger.info(
        `Position closed: ${baseTokenAmountRemoved.toFixed(4)} ${tokenXSymbol} + ${baseFeeAmount.toFixed(4)} ${tokenXSymbol} fees, ${quoteTokenAmountRemoved.toFixed(4)} ${tokenYSymbol} + ${quoteFeeAmount.toFixed(4)} ${tokenYSymbol} fees, ${positionRentRefunded.toFixed(6)} SOL rent refunded`,
      );

      return {
        signature,
        status: 1, // CONFIRMED
        data: {
          fee: totalFee,
          positionRentRefunded: positionRentRefunded,
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

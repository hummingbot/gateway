import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { FastifyInstance } from 'fastify';

import { logger } from '../../../services/logger';
import { WrapResponseType } from '../schemas';
import { Solana } from '../solana';
import { handleSolanaTransactionError } from '../solana-errors';

/**
 * Wrap SOL to WSOL
 * Creates WSOL token account if needed, transfers SOL, and syncs native balance
 */
export async function wrapSolana(
  fastify: FastifyInstance,
  network: string,
  address: string,
  amount: string,
): Promise<WrapResponseType> {
  // Get Solana instance for the specified network
  const solana = await Solana.getInstance(network);

  // Parse amount to lamports (1 SOL = 1,000,000,000 lamports)
  const amountInLamports = Math.floor(parseFloat(amount) * 1_000_000_000);

  if (amountInLamports <= 0) {
    throw fastify.httpErrors.badRequest('Amount must be greater than 0');
  }

  try {
    const walletPubkey = new PublicKey(address);

    // Get wrap instructions from Solana chain
    const instructions = await solana.wrapSOL(walletPubkey, amountInLamports);

    // Get recent blockhash
    const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

    // Build message
    const messageV0 = new TransactionMessage({
      payerKey: walletPubkey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    // Signed and sent through the wallet chokepoint (the signer seam), which simulates first.
    const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, address);
    const txData = await solana.getConfirmedTransactionData(signature);
    const confirmed = txData !== null;

    // Calculate fee from transaction data
    let feeInSol = '0';
    if (txData?.meta?.fee) {
      feeInSol = (txData.meta.fee / 1_000_000_000).toString();
    }

    // Return response based on confirmation status
    if (confirmed && txData) {
      return {
        signature,
        status: 1, // CONFIRMED
        data: {
          fee: feeInSol,
          amount: amount,
          wrappedAddress: 'So11111111111111111111111111111111111111112', // NATIVE_MINT
          nativeToken: 'SOL',
          wrappedToken: 'WSOL',
        },
      };
    } else {
      return {
        signature,
        status: 0, // PENDING
      };
    }
  } catch (error: any) {
    logger.error(`Error wrapping SOL to WSOL: ${error.message}`);
    handleSolanaTransactionError(fastify, error, 'wrap SOL to WSOL');
  }
}

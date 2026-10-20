import { NATIVE_MINT, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, AccountLayout } from '@solana/spl-token';
import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { FastifyInstance } from 'fastify';

import { logger } from '../../../services/logger';
import { UnwrapResponseType } from '../schemas';
import { Solana } from '../solana';
import { UnsignedTransactionCaptured } from '../solana-build-mode';
import { handleSolanaTransactionError } from '../solana-errors';

/**
 * Unwrap WSOL to SOL
 * Closes WSOL token account and returns SOL to wallet
 */
export async function unwrapSolana(
  fastify: FastifyInstance,
  network: string,
  address: string,
  amount?: string,
): Promise<UnwrapResponseType> {
  // Get Solana instance for the specified network
  const solana = await Solana.getInstance(network);

  try {
    const walletPubkey = new PublicKey(address);

    // Get WSOL token account address
    const wsolAccount = getAssociatedTokenAddressSync(NATIVE_MINT, walletPubkey, false, TOKEN_PROGRAM_ID);

    // Check if WSOL account exists and get balance
    const accountInfo = await solana.connection.getAccountInfo(wsolAccount);

    if (!accountInfo) {
      throw fastify.httpErrors.badRequest('No WSOL token account found for this wallet');
    }

    // Decode account data to get balance
    const accountData = AccountLayout.decode(new Uint8Array(accountInfo.data));
    const wsolBalance = Number(accountData.amount);

    if (wsolBalance === 0) {
      throw fastify.httpErrors.badRequest('WSOL balance is zero, nothing to unwrap');
    }

    // If amount is specified, validate it
    let amountToUnwrap = wsolBalance;
    if (amount) {
      const requestedLamports = Math.floor(parseFloat(amount) * 1_000_000_000);
      if (requestedLamports <= 0) {
        throw fastify.httpErrors.badRequest('Amount must be greater than 0');
      }
      if (requestedLamports > wsolBalance) {
        throw fastify.httpErrors.badRequest(
          `Insufficient WSOL balance. Available: ${(wsolBalance / 1_000_000_000).toFixed(9)}, Requested: ${amount}`,
        );
      }
      amountToUnwrap = requestedLamports;
    }

    // Note: unwrapSOL closes the entire account, so we always unwrap all WSOL
    // If user specified a partial amount, we warn them
    if (amount && amountToUnwrap < wsolBalance) {
      logger.warn(
        `User requested to unwrap ${amount} SOL but unwrap operation closes the entire WSOL account. ` +
          `All ${(wsolBalance / 1_000_000_000).toFixed(9)} WSOL will be unwrapped.`,
      );
    }

    // Get unwrap instruction from Solana chain
    const unwrapInstruction = solana.unwrapSOL(walletPubkey, TOKEN_PROGRAM_ID);

    // Get recent blockhash
    const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

    // Build message
    const messageV0 = new TransactionMessage({
      payerKey: walletPubkey,
      recentBlockhash: blockhash,
      instructions: [unwrapInstruction],
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
          amount: (wsolBalance / 1_000_000_000).toString(),
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
    // The build-mode sentinel is the build's result, not an error.
    if (!(error instanceof UnsignedTransactionCaptured)) logger.error(`Error unwrapping WSOL to SOL: ${error.message}`);
    handleSolanaTransactionError(fastify, error, 'unwrap WSOL to SOL');
  }
}

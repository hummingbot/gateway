import { NATIVE_MINT, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, AccountLayout } from '@solana/spl-token';
import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { logger } from '../../../services/logger';
import { UnwrapRequestSchema, UnwrapResponseSchema, UnwrapRequestType, UnwrapResponseType } from '../schemas';
import { Solana } from '../solana';
import { SolanaLedger } from '../solana-ledger';

/**
 * Handle common Solana transaction errors
 */
function handleSolanaTransactionError(fastify: FastifyInstance, error: any, operation: string): never {
  // Re-throw errors that already have statusCode (our custom errors)
  if (error.statusCode) {
    throw error;
  }

  const message = error.message || '';

  // Map common error patterns to appropriate HTTP errors
  if (message.includes('insufficient funds')) {
    throw fastify.httpErrors.badRequest(
      `Insufficient funds for transaction. Please ensure you have enough SOL to ${operation} and pay for transaction fees.`,
    );
  }

  if (message.includes('timeout')) {
    throw fastify.httpErrors.requestTimeout(
      `Transaction timeout. The transaction may still be pending. Signature: ${error.signature || 'unknown'}`,
    );
  }

  if (message.includes('rejected on Ledger')) {
    throw fastify.httpErrors.badRequest('Transaction rejected on Ledger device');
  }

  if (message.includes('Ledger device is locked') || message.includes('Wrong app is open')) {
    throw fastify.httpErrors.badRequest(message);
  }

  // Default to internal server error for unknown errors
  throw fastify.httpErrors.internalServerError(`Failed to ${operation}: ${message}`);
}

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

  // Check if this is a hardware wallet
  const isHardware = await solana.isHardwareWallet(address);

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

    // Create versioned transaction
    let transaction = new VersionedTransaction(messageV0);

    if (isHardware) {
      // Hardware wallet flow
      logger.info(`Hardware wallet detected for ${address}. Building unwrap transaction for Ledger signing.`);

      const ledger = new SolanaLedger();
      const signedTx = await ledger.signTransaction(address, transaction);
      transaction = signedTx as VersionedTransaction;
    } else {
      // Regular wallet flow
      const keypair = await solana.getWallet(address);
      transaction.sign([keypair]);
    }

    // Simulate transaction with proper error handling before sending
    await solana.simulateWithErrorHandling(transaction, fastify);

    // Send and confirm transaction
    const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

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
    logger.error(`Error unwrapping WSOL to SOL: ${error.message}`);
    handleSolanaTransactionError(fastify, error, 'unwrap WSOL to SOL');
  }
}

export const unwrapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: UnwrapRequestType;
    Reply: UnwrapResponseType;
  }>(
    '/unwrap',
    {
      schema: {
        description: 'Unwrap WSOL to SOL. Note: This closes the entire WSOL account, returning all WSOL as SOL.',
        tags: ['/chain/solana'],
        body: UnwrapRequestSchema,
        response: {
          200: UnwrapResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, address, amount } = request.body;
      return await unwrapSolana(fastify, network, address, amount);
    },
  );
};

export default unwrapRoute;

import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { logger } from '../../../services/logger';
import { WrapRequestSchema, WrapResponseSchema, WrapRequestType, WrapResponseType } from '../schemas';
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

  // Check if this is a hardware wallet
  const isHardware = await solana.isHardwareWallet(address);

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

    // Create versioned transaction
    let transaction = new VersionedTransaction(messageV0);

    if (isHardware) {
      // Hardware wallet flow
      logger.info(`Hardware wallet detected for ${address}. Building wrap transaction for Ledger signing.`);

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

export const wrapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: WrapRequestType;
    Reply: WrapResponseType;
  }>(
    '/wrap',
    {
      schema: {
        description: 'Wrap SOL to WSOL (Wrapped SOL)',
        tags: ['/chain/solana'],
        body: WrapRequestSchema,
        response: {
          200: WrapResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, address, amount } = request.body;
      return await wrapSolana(fastify, network, address, amount);
    },
  );
};

export default wrapRoute;

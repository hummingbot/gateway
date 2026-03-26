/**
 * Solana Execute Transaction Route
 * Executes transaction payloads from external APIs (like USDM)
 */

import { PublicKey, Transaction, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';

import { logger } from '../../../services/logger';
import { PrivySolanaSigner } from '../../../wallet/privy';
import { isPrivyWallet, getPrivyWalletByAddress } from '../../../wallet/utils';
import {
  SolanaExecuteTxRequest,
  SolanaExecuteTxRequestSchema,
  SolanaExecuteTxResponse,
  SolanaExecuteTxResponseSchema,
  SolanaInstruction,
} from '../schemas';
import { Solana } from '../solana';
import { handleSolanaTransactionError } from '../solana-errors';
import { SolanaLedger } from '../solana-ledger';
import { getSolanaChainConfig } from '../solana.config';

/**
 * Build a Transaction from USDM-format instructions
 */
async function buildTransactionFromInstructions(
  solana: Solana,
  instructions: SolanaInstruction[],
  feePayer: PublicKey,
): Promise<Transaction> {
  const tx = new Transaction();

  for (const ix of instructions) {
    const keys = ix.keys.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    }));

    const programId = new PublicKey(ix.programId);
    const data = Buffer.from(ix.data, 'base64');

    tx.add(new TransactionInstruction({ keys, programId, data }));
  }

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await solana.connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = feePayer;

  return tx;
}

/**
 * Deserialize a transaction from base64
 */
function deserializeTransaction(serializedTx: string): Transaction | VersionedTransaction {
  const buffer = Uint8Array.from(Buffer.from(serializedTx, 'base64'));

  // Try VersionedTransaction first (newer format)
  try {
    return VersionedTransaction.deserialize(buffer);
  } catch {
    // Fall back to legacy Transaction
    return Transaction.from(buffer);
  }
}

/**
 * Execute a Solana transaction
 */
export async function executeSolanaTransaction(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  request: SolanaExecuteTxRequest,
): Promise<SolanaExecuteTxResponse> {
  // Normalize input: support both 'instructions' array and 'ix' single instruction (USDM format)
  const instructions = request.instructions || (request.ix ? [request.ix] : undefined);

  // Validate inputs - must provide either serializedTx or instructions/ix
  if (!request.serializedTx && !instructions) {
    throw fastify.httpErrors.badRequest('Must provide either serializedTx, instructions, or ix');
  }

  const hasInstructions = instructions && instructions.length > 0;
  if (request.serializedTx && hasInstructions) {
    throw fastify.httpErrors.badRequest('Cannot provide both serializedTx and instructions/ix');
  }

  const solana = await Solana.getInstance(network);
  const walletPubkey = new PublicKey(walletAddress);

  // Check wallet type
  const isHardware = await solana.isHardwareWallet(walletAddress);
  const isPrivy = await isPrivyWallet('solana', walletAddress);

  try {
    // Build or deserialize the transaction
    let tx: Transaction | VersionedTransaction;

    if (request.serializedTx) {
      tx = deserializeTransaction(request.serializedTx);
      logger.info(`Deserialized transaction from base64`);
    } else {
      tx = await buildTransactionFromInstructions(solana, instructions!, walletPubkey);
      logger.info(`Built transaction from ${instructions!.length} instruction(s)`);
    }

    // Sign if needed
    if (!request.skipSign) {
      if (isPrivy) {
        // Sign via Privy
        logger.info(`Signing transaction with Privy wallet ${walletAddress}`);
        const privyWallet = await getPrivyWalletByAddress('solana', walletAddress);
        if (!privyWallet) {
          throw fastify.httpErrors.badRequest(`Privy wallet not found for address: ${walletAddress}`);
        }

        const privySigner = new PrivySolanaSigner(privyWallet.privyWalletId, walletAddress);
        tx = await privySigner.signTransaction(tx);
      } else if (isHardware) {
        // Sign with hardware wallet (Ledger)
        logger.info(`Hardware wallet detected for ${walletAddress}. Signing transaction with Ledger.`);
        const ledger = new SolanaLedger();
        tx = (await ledger.signTransaction(walletAddress, tx)) as Transaction | VersionedTransaction;
      } else {
        // Sign with local keypair
        const keypair = await solana.getWallet(walletAddress);

        if (tx instanceof Transaction) {
          tx.sign(keypair);
        } else {
          // VersionedTransaction - sign with keypair
          tx.sign([keypair]);
        }
        logger.info(`Signed transaction with local wallet`);
      }
    }

    // Simulate transaction with proper error handling before sending
    await solana.simulateWithErrorHandling(tx, fastify);

    // Send and confirm transaction
    const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(tx);

    // Calculate fee from transaction data
    let feeInSol = 0;
    if (txData?.meta?.fee) {
      feeInSol = txData.meta.fee / 1_000_000_000;
    }

    // Return response based on confirmation status
    if (confirmed && txData) {
      return {
        signature,
        status: 1, // CONFIRMED
        fee: feeInSol,
      };
    } else if (signature) {
      return {
        signature,
        status: 0, // PENDING
      };
    } else {
      return {
        signature: '',
        status: -1, // FAILED
        error: 'Transaction failed to send',
      };
    }
  } catch (error: any) {
    logger.error(`Error executing transaction: ${error.message}`);
    handleSolanaTransactionError(fastify, error, 'execute transaction');
  }
}

/**
 * Route handler for execute-tx endpoint
 */
export const executeTxRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: SolanaExecuteTxRequest;
    Reply: SolanaExecuteTxResponse;
  }>(
    '/execute-tx',
    {
      schema: {
        description:
          'Execute a transaction payload. Accepts either: (1) serializedTx - base64 encoded transaction, (2) instructions - array of instructions, or (3) ix - single instruction (USDM format). Supports local wallets, hardware wallets (Ledger), and Privy wallets.',
        tags: ['/chain/solana'],
        body: SolanaExecuteTxRequestSchema,
        response: {
          200: SolanaExecuteTxResponseSchema,
        },
      },
    },
    async (request) => {
      // Apply config defaults
      const chainConfig = getSolanaChainConfig();
      const network = request.body.network || chainConfig.defaultNetwork;
      const walletAddress = request.body.walletAddress || chainConfig.defaultWallet;

      if (!walletAddress) {
        throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet configured');
      }

      return await executeSolanaTransaction(fastify, network, walletAddress, request.body);
    },
  );
};

export default executeTxRoute;

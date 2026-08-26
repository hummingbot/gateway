import { FastifyInstance } from 'fastify';

import { PollResponseType, TransactionStatusCode } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Solana } from '../solana';
import { parseSolanaError } from '../solana-error-parser';

export async function pollSolanaTransaction(
  _fastify: FastifyInstance,
  network: string,
  signature: string,
): Promise<PollResponseType> {
  const solana = await Solana.getInstance(network);

  try {
    const currentBlock = await solana.getCurrentBlockNumber();

    // Validate transaction signature format. A malformed signature can never
    // resolve, so report NOT_FOUND rather than a pending status a poller would
    // wait on forever.
    if (!signature || typeof signature !== 'string' || !signature.match(/^[A-Za-z0-9]{43,88}$/)) {
      return {
        currentBlock,
        signature,
        txBlock: null,
        txStatus: TransactionStatusCode.NOT_FOUND,
        fee: null,
        error: 'INVALID_INPUT: Invalid transaction signature format',
        txData: null,
      };
    }

    const txData = await solana.getTransaction(signature);

    if (!txData) {
      // Null txData means either "seen but awaiting confirmation" or "unknown to
      // the cluster" (dropped, or never received). Only the signature-status
      // cache separates them: UNCONFIRMED is worth polling again, NOT_FOUND is
      // terminal once the transaction's blockhash has expired.
      const txStatus = await solana.getSignatureStatus(signature);
      return {
        currentBlock,
        signature,
        txBlock: null,
        txStatus,
        fee: null,
        error: null,
        txData: null,
      };
    }

    const txStatus = await solana.getTransactionStatusCode(txData as any);

    // Extract fee from transaction
    const fee = txData.meta?.fee ? txData.meta.fee / 1e9 : 0; // Convert lamports to SOL

    // Check for transaction error and parse it. The err object carries the code but
    // names no program, so parse it together with the program logs — attribution
    // comes from the "Program X failed: custom program error" line, and without it
    // every program-specific code (e.g. Orca 6018) falls through to UNKNOWN.
    let error: string | null = null;
    if (txData.meta?.err) {
      const errorStr = [JSON.stringify(txData.meta.err), ...(txData.meta.logMessages ?? [])].join('\n');
      const parsed = parseSolanaError(errorStr);
      error = `${parsed.type} (${parsed.errorCodeHex || 'unknown'}): ${parsed.message}`;
      logger.info(`Transaction ${signature} failed: ${error}`);
    } else {
      logger.info(`Transaction ${signature} - Status: ${txStatus}, Fee: ${fee} SOL`);
    }

    return {
      currentBlock,
      signature,
      txBlock: txData.slot,
      txStatus,
      fee,
      error,
      txData,
    };
  } catch (err) {
    // Transient failure (RPC error, etc.) — the transaction's fate is unknown, so
    // report pending rather than NOT_FOUND: the caller should poll again, not give up.
    logger.error(`Error polling transaction ${signature}: ${(err as Error).message}`);
    return {
      currentBlock: await solana.getCurrentBlockNumber(),
      signature,
      txBlock: null,
      txStatus: TransactionStatusCode.PENDING,
      fee: null,
      error: `Error polling transaction: ${(err as Error).message}`,
      txData: null,
    };
  }
}

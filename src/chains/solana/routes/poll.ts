import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { PollRequestType, PollResponseType, PollResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { SolanaPollRequest } from '../schemas';
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

    // Validate transaction signature format
    if (!signature || typeof signature !== 'string' || !signature.match(/^[A-Za-z0-9]{43,88}$/)) {
      return {
        currentBlock,
        signature,
        txBlock: null,
        txStatus: 0,
        fee: null,
        error: 'INVALID_INPUT: Invalid transaction signature format',
        txData: null,
      };
    }

    const txData = await solana.getTransaction(signature);

    if (!txData) {
      return {
        currentBlock,
        signature,
        txBlock: null,
        txStatus: 0,
        fee: null,
        error: null,
        txData: null,
      };
    }

    const txStatus = await solana.getTransactionStatusCode(txData as any);

    // Extract fee from transaction
    const fee = txData.meta?.fee ? txData.meta.fee / 1e9 : 0; // Convert lamports to SOL

    // Check for transaction error and parse it
    let error: string | null = null;
    if (txData.meta?.err) {
      const errorStr = JSON.stringify(txData.meta.err);
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
    logger.error(`Error polling transaction ${signature}: ${(err as Error).message}`);
    return {
      currentBlock: await solana.getCurrentBlockNumber(),
      signature,
      txBlock: null,
      txStatus: 0,
      fee: null,
      error: 'Transaction not found or invalid',
      txData: null,
    };
  }
}

export const pollRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: PollRequestType;
    Reply: PollResponseType;
  }>(
    '/poll',
    {
      schema: {
        description: 'Poll for the status of a Solana transaction',
        tags: ['/chain/solana'],
        body: SolanaPollRequest,
        response: {
          200: PollResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, signature } = request.body;
      return await pollSolanaTransaction(fastify, network, signature);
    },
  );
};

export default pollRoute;

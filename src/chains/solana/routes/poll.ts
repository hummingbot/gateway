import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { PollRequestType, PollResponseType, PollResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { SolanaPollRequest } from '../schemas';
import { Solana } from '../solana';

// Transaction parse result type (used internally)
interface TransactionParseResult {
  signature: string;
  txBlock: number | null;
  txStatus: number;
  fee: number | null;
  txData: any;
  error?: string;
}

// Parse a single transaction and extract details (without currentBlock)
export async function parseSolanaTransaction(network: string, signature: string): Promise<TransactionParseResult> {
  const solana = await Solana.getInstance(network);

  try {
    // Validate transaction signature format
    if (!signature || typeof signature !== 'string' || !signature.match(/^[A-Za-z0-9]{43,88}$/)) {
      return {
        signature,
        txBlock: null,
        txStatus: 0,
        txData: null,
        fee: null,
        error: 'Invalid transaction signature format',
      };
    }

    const txData = await solana.getTransaction(signature);

    if (!txData) {
      return {
        signature,
        txBlock: null,
        txStatus: 0,
        txData: null,
        fee: null,
      };
    }

    const txStatus = await solana.getTransactionStatusCode(txData as any);

    // Get transaction fee
    const fee = txData.meta?.fee ? txData.meta.fee / 1e9 : 0;

    return {
      signature,
      txBlock: txData.slot,
      txStatus,
      fee,
      txData,
    };
  } catch (error) {
    logger.error(`Error parsing transaction ${signature}: ${error.message}`);
    return {
      signature,
      txBlock: null,
      txStatus: 0,
      txData: null,
      fee: null,
      error: 'Transaction not found or invalid',
    };
  }
}

export async function pollSolanaTransaction(
  _fastify: FastifyInstance,
  network: string,
  signature: string,
): Promise<PollResponseType> {
  const solana = await Solana.getInstance(network);
  const currentBlock = await solana.getCurrentBlockNumber();

  // Parse the transaction
  const txItem = await parseSolanaTransaction(network, signature);

  // Add currentBlock to match PollResponse schema
  return {
    currentBlock,
    ...txItem,
  };
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

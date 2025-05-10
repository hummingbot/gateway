import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  PollRequestType,
  PollResponseType,
  PollRequestSchema,
  PollResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Solana } from '../solana';

export async function pollSolanaTransaction(
  _fastify: FastifyInstance,
  network: string,
  txHash: string,
): Promise<PollResponseType> {
  const solana = await Solana.getInstance(network);

  try {
    const currentBlock = await solana.getCurrentBlockNumber();

    // Validate transaction hash format
    if (
      !txHash ||
      typeof txHash !== 'string' ||
      !txHash.match(/^[A-Za-z0-9]{43,88}$/)
    ) {
      return {
        currentBlock,
        txHash,
        txBlock: null,
        txStatus: 0,
        txData: null,
        fee: null,
        error: 'Invalid transaction hash format',
      };
    }

    const txData = await solana.getTransaction(txHash);

    if (!txData) {
      return {
        currentBlock,
        txHash,
        txBlock: null,
        txStatus: 0,
        txData: null,
        fee: null,
      };
    }

    const txStatus = await solana.getTransactionStatusCode(txData as any);
    const { balanceChange, fee } =
      await solana.extractAccountBalanceChangeAndFee(txHash, 0);

    logger.info(
      `Polling for transaction ${txHash}, Status: ${txStatus}, Balance Change: ${balanceChange} SOL, Fee: ${fee} SOL`,
    );

    return {
      currentBlock,
      txHash,
      txBlock: txData.slot,
      txStatus,
      fee,
      txData,
    };
  } catch (error) {
    logger.error(`Error polling transaction ${txHash}: ${error.message}`);
    return {
      currentBlock: await solana.getCurrentBlockNumber(),
      txHash,
      txBlock: null,
      txStatus: 0,
      txData: null,
      fee: null,
      error: 'Transaction not found or invalid',
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
        tags: ['solana'],
        body: {
          ...PollRequestSchema,
          properties: {
            ...PollRequestSchema.properties,
            network: { type: 'string', examples: ['mainnet-beta', 'devnet'] },
            txHash: {
              type: 'string',
              examples: [
                '55ukR6VCt1sQFMC8Nyeo51R1SMaTzUC7jikmkEJ2jjkQNdqBxXHraH7vaoaNmf8rX4Y55EXAj8XXoyzvvsrQqWZa',
              ],
            },
          },
        },
        response: {
          200: PollResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, txHash } = request.body;
      return await pollSolanaTransaction(fastify, network, txHash);
    },
  );
};

export default pollRoute;

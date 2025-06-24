import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  PollRequestType,
  PollResponseType,
  PollRequestSchema,
  PollResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Cardano } from '../cardano';

export async function pollCardanoTransaction(
  _fastify: FastifyInstance,
  network: string,
  txHash: string,
): Promise<PollResponseType> {
  const cardano = await Cardano.getInstance(network);

  try {
    const currentBlock = await cardano.getCurrentBlockNumber();

    // Validate transaction signature format
    if (!txHash || typeof txHash !== 'string') {
      return {
        currentBlock,
        signature: txHash,
        txBlock: null,
        txStatus: 0,
        txData: null,
        fee: null,
        error: 'Invalid transaction signature format',
      };
    }

    const txData = await cardano.getTransaction(txHash);

    if (!txData) {
      return {
        currentBlock,
        signature: txHash,
        txBlock: null,
        txStatus: 0,
        txData: null,
        fee: null,
      };
    }

    return {
      currentBlock,
      signature: txHash,
      txBlock: txData.block,
      txStatus: txData.status,
      fee: txData.fees,
      txData,
    };
  } catch (error) {
    logger.error(`Error polling transaction ${txHash}: ${error.message}`);
    return {
      currentBlock: await cardano.getCurrentBlockNumber(),
      signature: txHash,
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
        description: 'Poll for the status of a Cardano transaction',
        tags: ['cardano'],
        body: {
          ...PollRequestSchema,
          properties: {
            ...PollRequestSchema.properties,
            network: {
              type: 'string',
              examples: ['mainnet', 'preprod', 'preview'],
            },
            signature: {
              type: 'string',
              examples: [
                'a03a01fb56ba60fab341bcb95340302853aea4c3d8faace9ba930a5b3e93f307',
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
      const { network, signature } = request.body;
      return await pollCardanoTransaction(fastify, network, signature);
    },
  );
};

export default pollRoute;

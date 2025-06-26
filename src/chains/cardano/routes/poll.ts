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
  signature: string,
): Promise<PollResponseType> {
  const cardano = await Cardano.getInstance(network);

  try {
    const currentBlock = await cardano.getCurrentBlockNumber();

    // Validate transaction signature format
    if (!signature || typeof signature !== 'string') {
      return {
        currentBlock,
        signature,
        txBlock: null,
        txStatus: 0,
        txData: null,
        fee: null,
        error: 'Invalid transaction signature format',
      };
    }

    const txData = await cardano.getTransaction(signature);

    if (!txData) {
      return {
        currentBlock,
        signature,
        txBlock: null,
        txStatus: 0,
        txData: null,
        fee: null,
      };
    }

    return {
      currentBlock,
      signature,
      txBlock: txData.blockHeight,
      txStatus: txData.status,
      fee: txData.fees,
      txData,
    };
  } catch (error) {
    logger.error(`Error polling transaction ${signature}: ${error.message}`);
    return {
      currentBlock: await cardano.getCurrentBlockNumber(),
      signature,
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
                '66f5f15d15124a77418cfa3ec0e72cc1d2295647e528a9ecb4636f9ed5342d06',
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

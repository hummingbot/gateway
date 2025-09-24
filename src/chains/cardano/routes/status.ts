import { FastifyPluginAsync } from 'fastify';

import {
  StatusRequestType,
  StatusResponseType,
  StatusRequestSchema,
  StatusResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Cardano } from '../cardano';

export async function getCardanoStatus(network: string): Promise<StatusResponseType> {
  try {
    const cardano = await Cardano.getInstance(network);
    const chain = 'cardano';
    const rpcUrl = cardano.apiURL;
    const nativeCurrency = cardano.nativeTokenSymbol;
    const rpcProvider = 'blockfrost'; // Currently only Blockfrost is supported

    // Directly try to get the current block number with a timeout
    let currentBlockNumber = 0;
    try {
      // Set up a timeout promise to prevent hanging on unresponsive nodes
      const blockPromise = await cardano.getCurrentBlockNumber();
      const timeoutPromise = new Promise<number>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 5000);
      });

      // Race the block request against the timeout
      currentBlockNumber = await Promise.race([blockPromise, timeoutPromise]);
    } catch (blockError) {
      logger.warn(`Failed to get block number: ${blockError.message}`);
      // Continue with default block number
    }

    return {
      chain,
      network,
      rpcUrl,
      rpcProvider,
      currentBlockNumber,
      nativeCurrency,
    };
  } catch (error) {
    logger.error(`Error getting Cardano status: ${error.message}`);
    throw new Error(`Failed to get Cardano status: ${error.message}`);
  }
}

export const statusRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: StatusRequestType;
    Reply: StatusResponseType;
  }>(
    '/status',
    {
      schema: {
        description: 'Get Cardano chain status',
        tags: ['/chain/cardano'],
        querystring: {
          ...StatusRequestSchema,
          properties: {
            ...StatusRequestSchema.properties,
            network: {
              type: 'string',
              examples: ['mainnet', 'preprod', 'preview'],
            },
          },
        },
        response: {
          200: StatusResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { network } = request.query;
      try {
        // This will handle node timeout internally
        return await getCardanoStatus(network);
      } catch (error) {
        // This will catch any other unexpected errors
        logger.error(`Error in Cardano status endpoint: ${error.message}`);
        reply.status(500);
        // Return a minimal valid response
        return {
          chain: 'cardano',
          network,
          rpcUrl: 'unavailable',
          rpcProvider: 'unavailable',
          currentBlockNumber: 0,
          nativeCurrency: 'ADA',
        };
      }
    },
  );
};

export default statusRoute;

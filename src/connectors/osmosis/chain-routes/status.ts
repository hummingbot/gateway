import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  StatusRequestType,
  StatusResponseType,
  StatusRequestSchema,
  StatusResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';

export async function status(fastify: FastifyInstance, network: string): Promise<StatusResponseType> {
  try {
    const osmosis = await Osmosis.getInstance(network);
    await osmosis.init();

    const chain = 'cosmos';
    const rpcProvider = 'osmosis';
    const swapProvider = 'osmosis';
    const nodeURL = osmosis.nodeURL;
    const nativeCurrency = osmosis.nativeTokenSymbol;

    // Directly try to get the current block number with a timeout
    let currentBlockNumber = 0;
    try {
      // Set up a timeout promise to prevent hanging on unresponsive nodes
      const blockPromise = osmosis.getCurrentBlockNumber();
      const timeoutPromise = new Promise<number>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 5000);
      });

      // Race the block request against the timeout
      currentBlockNumber = await Promise.race([blockPromise, timeoutPromise]);
    } catch (blockError) {
      logger.warn(`Failed to get block number: ${blockError.message}`);
    }

    return {
      chain,
      network,
      rpcUrl: nodeURL,
      currentBlockNumber,
      nativeCurrency,
      rpcProvider,
      swapProvider,
    };
  } catch (error) {
    logger.error(`Error getting cosmos status: ${error.message}`);
    fastify.httpErrors.internalServerError(`Failed to get cosmos status: ${error.message}`);
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
        description: 'Get cosmos chain status',
        tags: ['/chain/cosmos'],
        querystring: {
          ...StatusRequestSchema,
          properties: {
            ...StatusRequestSchema.properties,
            network: {
              type: 'string',
              examples: ['mainnet', 'testnet'],
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
        return await status(fastify, network);
      } catch (error) {
        // This will catch any other unexpected errors
        logger.error(`Error in cosmos status endpoint: ${error.message}`);
        reply.status(500);
        // Return a minimal valid response
        return {
          chain: 'cosmos',
          network,
          rpcUrl: 'unavailable',
          currentBlockNumber: 0,
          nativeCurrency: 'ATOM',
          rpcProvider: 'unavailable',
          swapProvider: 'unavailable',
        };
      }
    },
  );
};

export default statusRoute;

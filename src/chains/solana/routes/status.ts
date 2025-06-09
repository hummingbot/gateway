import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  StatusRequestType,
  StatusResponseType,
  StatusRequestSchema,
  StatusResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Solana } from '../solana';

export async function getSolanaStatus(
  fastify: FastifyInstance,
  network: string,
): Promise<StatusResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const chain = 'solana';
    const rpcUrl = solana.config.network.nodeURL;
    const nativeCurrency = solana.config.network.nativeCurrencySymbol;
    const currentBlockNumber = await solana.getCurrentBlockNumber();

    return {
      chain,
      network,
      rpcUrl,
      currentBlockNumber,
      nativeCurrency,
    };
  } catch (error) {
    logger.error(`Error getting Solana status: ${error.message}`);
    throw fastify.httpErrors.internalServerError(
      `Failed to get Solana status: ${error.message}`,
    );
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
        description: 'Get Solana network status',
        tags: ['solana'],
        querystring: {
          ...StatusRequestSchema,
          properties: {
            ...StatusRequestSchema.properties,
            network: { type: 'string', examples: ['mainnet-beta', 'devnet'] },
          },
        },
        response: {
          200: StatusResponseSchema,
        },
      },
    },
    async (request) => {
      const { network } = request.query;
      return await getSolanaStatus(fastify, network);
    },
  );
};

export default statusRoute;

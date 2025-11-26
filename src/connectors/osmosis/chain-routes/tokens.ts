import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  TokensRequestType,
  TokensResponseType,
  TokensRequestSchema,
  TokensResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';

export async function tokens(fastify: FastifyInstance, request: TokensRequestType): Promise<TokensResponseType> {
  try {
    let networkToUse = request.network ? request.network : 'mainnet';
    const osmosis = await Osmosis.getInstance(networkToUse);
    await osmosis.init();
    networkToUse = osmosis.network;
    logger.info(`Network: ${networkToUse}, Chain ID: ${osmosis.chainName}`);
    const response = await osmosis.controller.getTokens(osmosis, request);
    return response;
  } catch (error) {
    logger.error(`Error getting tokens: ${error.message}`);
    throw fastify.httpErrors.internalServerError(`Failed to estimate gas: ${error.message}`);
  }
}

export const tokensRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: TokensRequestType;
    Reply: TokensResponseType;
  }>(
    '/tokens',
    {
      schema: {
        description: 'Get Cosmos/Osmosis tokens',
        tags: ['/chain/cosmos'],
        querystring: {
          ...TokensRequestSchema,
          properties: {
            ...TokensRequestSchema.properties,
            network: {
              type: 'string',
              examples: ['mainnet', 'testnet'],
            },
          },
        },
        response: {
          200: TokensResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        return await tokens(fastify, request.query);
      } catch (error) {
        logger.error(`Error handling Osmosis tokens request: ${error.message}`);
        reply.status(500);
        return { tokens: [] };
      }
    },
  );
};

export default tokensRoute;

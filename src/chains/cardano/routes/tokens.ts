import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  TokensRequestType,
  TokensResponseType,
  TokensRequestSchema,
  TokensResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Cardano } from '../cardano';

export async function getCardanoTokens(
  fastify: FastifyInstance,
  network: string,
  tokenSymbols?: string[] | string,
): Promise<TokensResponseType> {
  try {
    const cardano = await Cardano.getInstance(network);
    let tokens = [];

    if (!tokenSymbols) {
      tokens = cardano.tokenList;
    } else {
      const symbolsArray = Array.isArray(tokenSymbols)
        ? tokenSymbols
        : typeof tokenSymbols === 'string'
          ? tokenSymbols.replace(/[\[\]]/g, '').split(',')
          : [];

      for (const symbol of symbolsArray) {
        const token = cardano.getTokenBySymbol(symbol.trim());
        if (token) tokens.push(token);
      }
    }

    return { tokens };
  } catch (error) {
    logger.error(`Error getting tokens: ${error.message}`);
    throw fastify.httpErrors.internalServerError(
      `Failed to get tokens: ${error.message}`,
    );
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
        description:
          'Get list of supported Cardano tokens with their addresses and decimals',
        tags: ['cardano'],
        querystring: {
          ...TokensRequestSchema,
          properties: {
            ...TokensRequestSchema.properties,
            network: { type: 'string', default: 'preprod' },
            tokenSymbols: { type: 'array', items: { type: 'string' } },
          },
        },
        response: {
          200: TokensResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, tokenSymbols } = request.query;
      return await getCardanoTokens(fastify, network, tokenSymbols);
    },
  );
};

export default tokensRoute;

import { FastifyPluginAsync } from 'fastify';

import {
  TokensRequestType,
  TokensResponseType,
  TokensRequestSchema,
  TokensResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Cardano } from '../cardano';

export async function getCardanoTokens(
  network: string,
  tokenSymbols?: string[] | string,
): Promise<TokensResponseType> {
  try {
    const cardano = await Cardano.getInstance(network);
    await cardano.init();

    let tokens = [];
    if (!tokenSymbols) {
      tokens = cardano.storedTokenList;
    } else {
      const symbolsArray = Array.isArray(tokenSymbols)
        ? tokenSymbols
        : typeof tokenSymbols === 'string'
          ? (tokenSymbols as string).replace(/[[\]]/g, '').split(',')
          : [];

      for (const symbol of symbolsArray) {
        const token = cardano.getTokenBySymbol(symbol.trim());
        if (token) tokens.push(token);
      }
    }

    return { tokens };
  } catch (error) {
    logger.error(`Error getting Cardano tokens: ${error.message}`);
    throw new Error(`Failed to get tokens: ${error.message}`);
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
        description: 'Get Cardano tokens',
        tags: ['cardano'],
        querystring: {
          ...TokensRequestSchema,
          properties: {
            ...TokensRequestSchema.properties,
            network: {
              type: 'string',
              examples: ['mainnet', 'preprod', 'preview'],
            },
          },
        },
        response: {
          200: TokensResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { network, tokenSymbols } = request.query;
      try {
        return await getCardanoTokens(network, tokenSymbols);
      } catch (error) {
        logger.error(`Error handling Cardano tokens request: ${error.message}`);
        reply.status(500);
        return { tokens: [] };
      }
    },
  );
};

export default tokensRoute;

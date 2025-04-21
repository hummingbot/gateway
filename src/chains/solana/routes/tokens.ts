import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Solana } from '../solana';
import { logger } from '../../../services/logger';
import { TokenInfo } from '@solana/spl-token-registry';
import { TokensRequestType, TokensResponseType, TokensRequestSchema, TokensResponseSchema } from '../../../schemas/chain-schema';

export async function getSolanaTokens(
  fastify: FastifyInstance,
  network: string,
  tokenSymbols?: string[] | string
): Promise<TokensResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    let tokens: TokenInfo[] = [];

    if (!tokenSymbols) {
      tokens = solana.tokenList;
    } else {
      const symbolsArray = Array.isArray(tokenSymbols) 
        ? tokenSymbols 
        : typeof tokenSymbols === 'string'
          ? tokenSymbols.replace(/[\[\]]/g, '').split(',')
          : [];
          
      for (const symbol of symbolsArray) {
        const token = await solana.getToken(symbol.trim());
        if (token) tokens.push(token);
      }
    }

    return { tokens };
  } catch (error) {
    logger.error(`Error getting tokens: ${error.message}`);
    throw fastify.httpErrors.internalServerError(`Failed to get tokens: ${error.message}`);
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
        description: 'Get list of supported Solana tokens with their addresses and decimals',
        tags: ['solana'],
        querystring: {
          ...TokensRequestSchema,
          properties: {
            ...TokensRequestSchema.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            tokenSymbols: { type: 'array', items: { type: 'string' } },
          }
        },
        response: {
          200: TokensResponseSchema
        }
      }
    },
    async (request) => {
      const { network, tokenSymbols } = request.query;
      return await getSolanaTokens(fastify, network, tokenSymbols);
    }
  );
};

export default tokensRoute;

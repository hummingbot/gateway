import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Ethereum } from '../ethereum';
import { logger } from '../../../services/logger';
import { TokensRequestType, TokensResponseType, TokensRequestSchema, TokensResponseSchema } from '../../../schemas/chain-schema';

export async function getEthereumTokens(
  network: string,
  tokenSymbols?: string[] | string
): Promise<TokensResponseType> {
  try {
    const ethereum = await Ethereum.getInstance(network);
    await ethereum.init();
    
    let tokens = [];
    if (!tokenSymbols) {
      tokens = ethereum.storedTokenList;
    } else {
      const symbolsArray = Array.isArray(tokenSymbols) 
        ? tokenSymbols 
        : typeof tokenSymbols === 'string'
          ? (tokenSymbols as string).replace(/[\[\]]/g, '').split(',')
          : [];
          
      for (const symbol of symbolsArray) {
        const token = ethereum.getTokenBySymbol(symbol.trim());
        if (token) tokens.push(token);
      }
    }
    
    return { tokens };
  } catch (error) {
    logger.error(`Error getting Ethereum tokens: ${error.message}`);
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
        description: 'Get Ethereum tokens',
        tags: ['ethereum'],
        querystring: {
          ...TokensRequestSchema,
          properties: {
            ...TokensRequestSchema.properties,
            network: { type: 'string', examples: ['mainnet', 'sepolia', 'polygon'] }
          }
        },
        response: {
          200: TokensResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { network, tokenSymbols } = request.query;
      try {
        return await getEthereumTokens(network, tokenSymbols);
      } catch (error) {
        logger.error(`Error handling Ethereum tokens request: ${error.message}`);
        reply.status(500);
        return { tokens: [] };
      }
    }
  );
};

export default tokensRoute;
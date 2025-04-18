import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Polkadot } from '../polkadot';
import { TokensRequestType, TokensResponseType, TokensRequestSchema, TokensResponseSchema } from '../../../schemas/chain-schema';
import { HttpException } from '../../../services/error-handler';

/**
 * Retrieves token information for Polkadot networks
 * 
 * This function gets a list of tokens supported by the specified Polkadot network.
 * It can optionally filter by specific token symbols if provided.
 * 
 * @param fastify Fastify instance
 * @param network Network identifier (e.g., 'mainnet', 'westend')
 * @param tokenSymbols Optional filter for specific token symbols
 * @returns Token information response
 */
export async function getPolkadotTokens(
  _fastify: FastifyInstance,
  network: string,
  tokenSymbols?: string[] | string
): Promise<TokensResponseType> {
  if (!network) {
    throw new HttpException(400, 'Network parameter is required', -1);
  }
  
  const polkadot = await Polkadot.getInstance(network);
  const tokens = await polkadot.getTokensWithSymbols(tokenSymbols);
  return { tokens };
}

/**
 * Route plugin that registers the tokens endpoint
 */
export const tokensRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: TokensRequestType;
    Reply: TokensResponseType;
  }>(
    '/tokens',
    {
      schema: {
        description: 'Get list of supported Polkadot tokens with their addresses and decimals',
        tags: ['polkadot'],
        querystring: TokensRequestSchema,
        response: {
          200: TokensResponseSchema
        }
      }
    },
    async (request) => {
      return await getPolkadotTokens(
        fastify,
        request.query.network,
        request.query.tokenSymbols
      );
    }
  );
};

export default tokensRoute; 
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Polkadot } from '../polkadot';
import { PolkadotTokensRequest, PolkadotTokensResponse, PolkadotTokensRequestSchema, PolkadotTokensResponseSchema } from '../polkadot.types';
import { HttpException } from '../../../services/error-handler';

/**
 * Retrieves token information from the Polkadot network
 * 
 * @param fastify Fastify instance
 * @param network Network identifier (e.g., 'mainnet', 'westend')
 * @param tokenSymbols Optional array or string of token symbols to filter by
 * @returns Token information for the requested tokens
 */
export async function getPolkadotTokens(
  _fastify: FastifyInstance,
  network: string,
  tokenSymbols?: string[] | string
): Promise<PolkadotTokensResponse> {
  if (!network) {
    throw new HttpException(400, 'Network parameter is required', -1);
  }
  
  const polkadot = await Polkadot.getInstance(network);
  const tokens = await polkadot.getTokensWithSymbols(tokenSymbols);
  
  return {
    tokens: tokens.map(token => ({
      symbol: token.symbol,
      address: token.address,
      decimals: token.decimals,
      name: token.name
    }))
  };
}

/**
 * Route plugin that registers the tokens endpoint
 */
export const tokensRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: PolkadotTokensRequest;
    Reply: PolkadotTokensResponse;
  }>(
    '/tokens',
    {
      schema: {
        description: 'Get token information for Polkadot network',
        tags: ['polkadot'],
        querystring: PolkadotTokensRequestSchema,
        response: {
          200: PolkadotTokensResponseSchema
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
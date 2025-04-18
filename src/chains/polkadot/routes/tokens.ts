import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Polkadot } from '../polkadot';
import { TokensRequestType, TokensResponseType, TokensRequestSchema, TokensResponseSchema } from '../../../schemas/chain-schema';
import { getInitializedChain } from '../../../services/connection-manager';

export async function getPolkadotTokens(
  _fastify: FastifyInstance,
  network: string,
  tokenSymbols?: string[] | string
): Promise<TokensResponseType> {
  const polkadot = await Polkadot.getInstance(network);
  const tokens = await polkadot.getTokensWithSymbols(tokenSymbols);
  return { tokens };
}

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
      const chain = await getInitializedChain<Polkadot>('polkadot', request.query.network);
      return await getPolkadotTokens(fastify, request.query.network, request.query.tokenSymbols);
    }
  );
};

export default tokensRoute; 
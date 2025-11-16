import { FastifyPluginAsync } from 'fastify';

import { FindTokenQuery, FindTokenQuerySchema, TokenInfo, TokenInfoSchema } from '../schemas';
import { handleTokenError } from '../token-error-handler';
import { fetchTokenInfo } from '../token-lookup-helper';

export const findTokenRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { address: string };
    Querystring: FindTokenQuery;
    Reply: TokenInfo;
  }>(
    '/find/:address',
    {
      schema: {
        description: 'Get token information with market data from GeckoTerminal by address',
        tags: ['/tokens'],
        params: {
          type: 'object',
          properties: {
            address: {
              type: 'string',
              description: 'Token contract address',
              examples: ['So11111111111111111111111111111111111111112', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
            },
          },
          required: ['address'],
        },
        querystring: FindTokenQuerySchema,
        response: {
          200: TokenInfoSchema,
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { chainNetwork } = request.query;

      try {
        // Fetch token info using shared helper
        return await fetchTokenInfo(chainNetwork, address);
      } catch (error: any) {
        handleTokenError(fastify, error, 'Failed to find token');
      }
    },
  );
};

export default findTokenRoute;

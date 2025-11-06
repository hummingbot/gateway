import { FastifyPluginAsync } from 'fastify';

import { getChainId } from '../../services/chain-utils';
import { CoinGeckoService } from '../../services/coingecko-service';
import { logger } from '../../services/logger';
import { FindTokenQuery, FindTokenQuerySchema, FindTokenResponse, FindTokenResponseSchema } from '../schemas';

export const findTokenRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { address: string };
    Querystring: FindTokenQuery;
    Reply: FindTokenResponse;
  }>(
    '/find/:address',
    {
      schema: {
        description: 'Get token information from GeckoTerminal by address',
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
          200: FindTokenResponseSchema,
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { chainNetwork } = request.query;

      try {
        // Fetch token info from GeckoTerminal
        const coinGeckoService = CoinGeckoService.getInstance();
        const tokenInfo = await coinGeckoService.getTokenInfo(chainNetwork, address);

        // Get chainId from chainNetwork
        const chainId = getChainId(chainNetwork);

        // Return in TokenSchema format (ready to save to token list)
        return {
          chainId,
          name: tokenInfo.name,
          symbol: tokenInfo.symbol,
          address: tokenInfo.address,
          decimals: tokenInfo.decimals,
        };
      } catch (error: any) {
        logger.error(`Failed to find token: ${error.message}`);

        if (error.message.includes('not found')) {
          throw fastify.httpErrors.notFound(error.message);
        }

        if (error.message.includes('Unsupported network')) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        throw fastify.httpErrors.internalServerError('Failed to fetch token info from GeckoTerminal');
      }
    },
  );
};

export default findTokenRoute;

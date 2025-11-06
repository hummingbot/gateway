import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getChainId } from '../../services/chain-utils';
import { CoinGeckoService } from '../../services/coingecko-service';
import { logger } from '../../services/logger';
import { TokenService } from '../../services/token-service';
import { FindTokenQuery, FindTokenQuerySchema, Token, TokenSchema } from '../schemas';

export const findSaveTokenRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { address: string };
    Querystring: FindTokenQuery;
    Reply: { message: string; token: Token };
  }>(
    '/find-save/:address',
    {
      schema: {
        description: 'Find token from GeckoTerminal and save it to the token list',
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
          200: Type.Object({
            message: Type.String(),
            token: TokenSchema,
          }),
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { chainNetwork } = request.query;

      try {
        // Parse chain-network parameter using CoinGeckoService
        const coinGeckoService = CoinGeckoService.getInstance();
        const { chain, network } = coinGeckoService.parseChainNetwork(chainNetwork);

        // Fetch token info from GeckoTerminal
        const tokenInfo = await coinGeckoService.getTokenInfo(chainNetwork, address);

        // Get chainId from chainNetwork
        const chainId = getChainId(chainNetwork);

        // Create token in save format
        const token = {
          chainId,
          name: tokenInfo.name,
          symbol: tokenInfo.symbol,
          address: tokenInfo.address,
          decimals: tokenInfo.decimals,
        };

        // Check if token already exists
        const tokenService = TokenService.getInstance();
        const existingToken = await tokenService.getToken(chain, network, token.symbol);

        if (existingToken) {
          logger.warn(`Token ${token.symbol} already exists in ${chain}/${network}`);
          return {
            message: `Token ${token.symbol} already exists in the token list for ${chain}/${network}`,
            token,
          };
        }

        // Save token to the token list
        await tokenService.addToken(chain, network, token);

        logger.info(`Successfully saved token ${token.symbol} (${token.address}) to ${chain}/${network}`);

        return {
          message: `Token ${token.symbol} has been added to the token list for ${chain}/${network}`,
          token,
        };
      } catch (error: any) {
        logger.error(`Failed to find and save token: ${error.message}`);

        // Re-throw if it's already an HTTP error
        if (error.statusCode) {
          throw error;
        }

        if (error.message.includes('not found')) {
          throw fastify.httpErrors.notFound(error.message);
        }

        if (error.message.includes('Unsupported network')) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        throw fastify.httpErrors.internalServerError('Failed to find and save token from GeckoTerminal');
      }
    },
  );
};

export default findSaveTokenRoute;

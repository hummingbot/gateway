import { Type } from '@sinclair/typebox';
import { ethers } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { CoinGeckoService } from '../../services/coingecko-service';
import { logger } from '../../services/logger';
import { TokenService } from '../../services/token-service';
import { FindTokenQuery, FindTokenQuerySchema, Token, TokenSchema } from '../schemas';
import { handleTokenError } from '../token-error-handler';
import { fetchTokenInfo } from '../token-lookup-helper';

export const saveTokenRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { address: string };
    Querystring: FindTokenQuery;
    Reply: { message: string; token: Token };
  }>(
    '/save/:address',
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

        // Fetch token info using shared helper
        const tokenInfo = await fetchTokenInfo(chainNetwork, address);

        // For Ethereum chains, normalize address to checksummed format
        let normalizedAddress = tokenInfo.address;
        if (chain === 'ethereum') {
          try {
            normalizedAddress = ethers.utils.getAddress(tokenInfo.address);
          } catch (error: any) {
            logger.warn(`Failed to checksum address ${tokenInfo.address}: ${error.message}`);
            // If checksumming fails, use the address as-is
          }
        }

        const token = {
          ...tokenInfo,
          address: normalizedAddress,
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
        handleTokenError(fastify, error, 'Failed to find and save token');
      }
    },
  );
};

export default saveTokenRoute;

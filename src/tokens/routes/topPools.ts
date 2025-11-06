import { FastifyPluginAsync } from 'fastify';

import { CoinGeckoService } from '../../services/coingecko-service';
import { logger } from '../../services/logger';
import { TokenService } from '../../services/token-service';
import { TopPoolsQuery, TopPoolsQuerySchema, TopPoolsResponse, TopPoolsResponseSchema } from '../schemas';

export const topPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { symbolOrAddress: string };
    Querystring: TopPoolsQuery;
    Reply: TopPoolsResponse;
  }>(
    '/top-pools/:symbolOrAddress',
    {
      schema: {
        description: 'Get top pools for a token by symbol or address from GeckoTerminal',
        tags: ['/tokens'],
        params: {
          type: 'object',
          properties: {
            symbolOrAddress: {
              type: 'string',
              description: 'Token symbol or contract address',
              examples: ['SOL', 'USDC', 'So11111111111111111111111111111111111111112'],
            },
          },
          required: ['symbolOrAddress'],
        },
        querystring: TopPoolsQuerySchema,
        response: {
          200: TopPoolsResponseSchema,
        },
      },
    },
    async (request) => {
      const { symbolOrAddress } = request.params;
      const { chainNetwork, limit = 10, connector, type } = request.query;

      try {
        // Parse chain-network parameter
        const parts = chainNetwork.split('-');
        if (parts.length < 2) {
          throw fastify.httpErrors.badRequest(
            `Invalid chainNetwork format: ${chainNetwork}. Expected format: chain-network (e.g., solana-mainnet-beta)`,
          );
        }

        const chain = parts[0];
        const network = parts.slice(1).join('-');

        // Resolve token address from symbol if needed
        let tokenAddress = symbolOrAddress;

        // Check if it's a symbol (not an address)
        // Ethereum addresses start with 0x, Solana addresses are 32-44 chars base58
        const isLikelySymbol =
          !symbolOrAddress.startsWith('0x') && (symbolOrAddress.length < 32 || symbolOrAddress.length > 44);

        if (isLikelySymbol) {
          // Try to resolve symbol to address
          const tokenService = TokenService.getInstance();
          const token = await tokenService.getToken(chain, network, symbolOrAddress);

          if (token) {
            tokenAddress = token.address;
            logger.info(`Resolved symbol ${symbolOrAddress} to address ${tokenAddress}`);
          } else {
            // If token not found in our list, assume the input is already an address
            logger.warn(`Token ${symbolOrAddress} not found in token list, treating as address`);
            tokenAddress = symbolOrAddress;
          }
        }

        // Fetch top pools from GeckoTerminal with optional filtering
        const coinGeckoService = CoinGeckoService.getInstance();
        const pools = await coinGeckoService.getTopPoolsForToken(chainNetwork, tokenAddress, limit, connector, type);

        if (pools.length === 0) {
          logger.warn(
            `No pools found for token ${tokenAddress} on ${chainNetwork}${connector ? ` (connector: ${connector})` : ''}${type ? ` (type: ${type})` : ''}`,
          );
        }

        return {
          pools,
          chainNetwork,
          tokenAddress,
        };
      } catch (error: any) {
        logger.error(`Failed to get top pools: ${error.message}`);

        if (error.message.includes('Unsupported network')) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        if (error.message.includes('Invalid chainNetwork')) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        throw fastify.httpErrors.internalServerError('Failed to fetch top pools from GeckoTerminal');
      }
    },
  );
};

export default topPoolsRoute;

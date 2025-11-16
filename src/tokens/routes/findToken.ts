import { FastifyPluginAsync } from 'fastify';

import { CoinGeckoService } from '../../services/coingecko-service';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { toTokenGeckoData } from '../../services/gecko-types';
import { logger } from '../../services/logger';
import { FindTokenQuery, FindTokenQuerySchema, TokenInfo, TokenInfoSchema } from '../schemas';

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
        // Fetch token info with market data from GeckoTerminal
        const coinGeckoService = CoinGeckoService.getInstance();
        const tokenData = await coinGeckoService.getTokenInfoWithMarketData(chainNetwork, address);

        // Get chainId from chainNetwork
        const configManager = ConfigManagerV2.getInstance();
        const chainId = configManager.getChainId(chainNetwork);

        // Transform to typed geckoData using helper
        const geckoData = toTokenGeckoData({
          coingeckoCoinId: tokenData.coingeckoCoinId,
          imageUrl: tokenData.imageUrl,
          priceUsd: tokenData.priceUsd,
          volumeUsd24h: tokenData.volumeUsd24h,
          marketCapUsd: tokenData.marketCapUsd,
          fdvUsd: tokenData.fdvUsd,
          totalSupply: tokenData.totalSupply,
          topPools: tokenData.topPools,
        });

        // Return TokenInfo with geckoData populated
        return {
          chainId,
          name: tokenData.name,
          symbol: tokenData.symbol,
          address: tokenData.address,
          decimals: tokenData.decimals,
          geckoData,
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

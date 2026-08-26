import { FastifyPluginAsync } from 'fastify';

import { parseChainNetwork } from '../../services/chain-network';
import { PoolService } from '../../services/pool-service';
import { GetPoolRequestSchema, PoolListResponseSchema } from '../schemas';

export const getPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { tradingPair: string };
    Querystring: {
      chainNetwork: string;
      type: string;
      connector?: string;
    };
  }>(
    '/:tradingPair',
    {
      schema: {
        description: 'Get a specific pool by trading pair',
        tags: ['/pools'],
        params: {
          type: 'object',
          properties: {
            tradingPair: {
              type: 'string',
              description: 'Trading pair (e.g., SOL-USDC, ETH-USDC)',
              examples: ['SOL-USDC', 'ETH-USDC'],
            },
          },
          required: ['tradingPair'],
        },
        querystring: GetPoolRequestSchema,
        response: {
          200: PoolListResponseSchema.items,
        },
      },
    },
    async (request) => {
      const { tradingPair } = request.params;
      const { chainNetwork, type, connector } = request.query;
      const { chain, network } = parseChainNetwork(chainNetwork);
      const poolService = PoolService.getInstance();

      try {
        // Parse trading pair (e.g., "ETH-USDC" -> ["ETH", "USDC"])
        const [baseToken, quoteToken] = tradingPair.split('-');

        if (!baseToken || !quoteToken) {
          throw new Error('Invalid trading pair format. Expected: BASE-QUOTE (e.g., ETH-USDC)');
        }

        const pool = await poolService.getPool(
          chain,
          network,
          type as 'amm' | 'clmm',
          baseToken,
          quoteToken,
          connector,
        );

        if (!pool) {
          const connectorInfo = connector ? ` (connector: ${connector})` : '';
          throw fastify.httpErrors.notFound(
            `Pool for ${tradingPair} not found on ${chain}/${network} ${type}${connectorInfo}`,
          );
        }

        return pool;
      } catch (error) {
        if (error.statusCode === 404) {
          throw error;
        }
        throw fastify.httpErrors.badRequest(error.message);
      }
    },
  );
};

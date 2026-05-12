import { FastifyPluginAsync } from 'fastify';

import { PoolService } from '../../services/pool-service';
import { GetPoolRequestSchema, PoolListResponseSchema } from '../schemas';

export const getPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { tradingPair: string };
    Querystring: {
      chain: string;
      network: string;
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
        querystring: {
          ...GetPoolRequestSchema,
          properties: {
            ...GetPoolRequestSchema.properties,
            network: {
              ...GetPoolRequestSchema.properties.network,
              default: 'mainnet-beta',
            },
          },
        },
        response: {
          200: PoolListResponseSchema.items,
          404: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request) => {
      const { tradingPair } = request.params;
      const { chain, network, type, connector } = request.query;
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

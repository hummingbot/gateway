import { FastifyPluginAsync } from 'fastify';

import { parseChainNetwork } from '../../services/chain-network';
import { PoolService } from '../../services/pool-service';
import { GetPoolRequestSchema, PoolListResponseSchema } from '../schemas';

export const getPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { tradingPairOrAddress: string };
    Querystring: {
      chainNetwork: string;
      type?: string;
      connector?: string;
    };
  }>(
    // The same path and parameter as DELETE /pools/{tradingPairOrAddress}: a consumer that
    // reads the route table by path shape sees one resource here, and one it is (#689).
    '/:tradingPairOrAddress',
    {
      schema: {
        description: 'Get a specific pool by trading pair (with type, and connector to narrow it) or by pool address',
        tags: ['/pools'],
        params: {
          type: 'object',
          properties: {
            tradingPairOrAddress: {
              type: 'string',
              description: 'Trading pair (e.g., SOL-USDC, ETH-USDC) or pool address',
              examples: ['SOL-USDC', 'ETH-USDC'],
            },
          },
          required: ['tradingPairOrAddress'],
        },
        querystring: GetPoolRequestSchema,
        response: {
          200: PoolListResponseSchema.items,
        },
      },
    },
    async (request) => {
      const { tradingPairOrAddress } = request.params;
      const { chainNetwork, type, connector } = request.query;
      const { chain, network } = parseChainNetwork(chainNetwork);
      const poolService = PoolService.getInstance();

      try {
        const byAddress = await poolService.getPoolByAddress(chain, network, tradingPairOrAddress);
        if (byAddress) {
          return byAddress;
        }

        // Parse trading pair (e.g., "ETH-USDC" -> ["ETH", "USDC"])
        const parts = tradingPairOrAddress.split('-');
        const [baseToken, quoteToken] = parts;

        if (parts.length !== 2 || !baseToken || !quoteToken) {
          throw new Error(
            `${tradingPairOrAddress} is not a pool address on ${chain}/${network}, and not a trading pair either. ` +
              'Expected: BASE-QUOTE (e.g., ETH-USDC)',
          );
        }
        if (type !== 'amm' && type !== 'clmm') {
          throw new Error('type (amm or clmm) is required to look a pool up by trading pair');
        }

        const pool = await poolService.getPool(chain, network, type, baseToken, quoteToken, connector);

        if (!pool) {
          const connectorInfo = connector ? ` (connector: ${connector})` : '';
          throw fastify.httpErrors.notFound(
            `Pool for ${tradingPairOrAddress} not found on ${chain}/${network} ${type}${connectorInfo}`,
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

export default getPoolRoute;

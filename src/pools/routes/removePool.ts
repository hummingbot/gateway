import { FastifyPluginAsync } from 'fastify';

import { parseChainNetwork } from '../../services/chain-network';
import { PoolService } from '../../services/pool-service';
import { GetPoolRequestSchema, PoolSuccessResponseSchema } from '../schemas';

export const removePoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{
    Params: { tradingPairOrAddress: string };
    Querystring: {
      chainNetwork: string;
      type?: string;
      connector?: string;
    };
  }>(
    // The same path and parameter as GET /pools/{tradingPairOrAddress}: a consumer that
    // reads the route table by path shape sees one resource here, and one it is (#689).
    '/:tradingPairOrAddress',
    {
      schema: {
        description:
          'Remove a pool by address, or by trading pair (with type, and connector to narrow it) when exactly one pool matches',
        tags: ['/pools'],
        params: {
          type: 'object',
          properties: {
            tradingPairOrAddress: {
              type: 'string',
              description: 'Pool contract address, or trading pair (e.g., SOL-USDC) to remove',
            },
          },
          required: ['tradingPairOrAddress'],
        },
        querystring: GetPoolRequestSchema,
        response: {
          200: PoolSuccessResponseSchema,
        },
      },
    },
    async (request) => {
      const { tradingPairOrAddress } = request.params;
      const { chainNetwork, type, connector } = request.query;
      const { chain, network } = parseChainNetwork(chainNetwork);
      const poolService = PoolService.getInstance();

      try {
        let address = tradingPairOrAddress;
        const byAddress = await poolService.getPoolByAddress(chain, network, tradingPairOrAddress);
        if (!byAddress) {
          // exactly BASE-QUOTE: a third segment must not be dropped on the way to a delete
          const parts = tradingPairOrAddress.split('-');
          if (parts.length !== 2 || !parts[0] || !parts[1]) {
            throw fastify.httpErrors.notFound(`Pool with address ${tradingPairOrAddress} not found`);
          }
          const [baseToken, quoteToken] = parts;
          if (type !== 'amm' && type !== 'clmm') {
            throw new Error('type (amm or clmm) is required to remove a pool by trading pair');
          }
          // A pair can name several pools (fee tiers, connectors); a delete must name one.
          const pools = await poolService.listPools(chain, network, connector, type);
          const matches = pools.filter(
            (p) =>
              (p.baseSymbol === baseToken && p.quoteSymbol === quoteToken) ||
              (p.baseSymbol === quoteToken && p.quoteSymbol === baseToken),
          );
          if (matches.length === 0) {
            const connectorInfo = connector ? ` (connector: ${connector})` : '';
            throw fastify.httpErrors.notFound(
              `Pool for ${tradingPairOrAddress} not found on ${chain}/${network} ${type}${connectorInfo}`,
            );
          }
          if (matches.length > 1) {
            throw new Error(
              `${matches.length} pools match ${tradingPairOrAddress} on ${chain}/${network} ${type}; ` +
                `remove one by address: ${matches.map((p) => `${p.connector} ${p.address}`).join(', ')}`,
            );
          }
          address = matches[0].address;
        }

        await poolService.removePool(chain, network, address);

        return {
          message: `Pool with address ${address} removed successfully from ${chain}/${network}`,
        };
      } catch (error) {
        if (error.statusCode === 404 || error.message.includes('not found')) {
          throw fastify.httpErrors.notFound(error.message);
        }
        throw fastify.httpErrors.badRequest(error.message);
      }
    },
  );
};

export default removePoolRoute;

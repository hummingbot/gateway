import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getPoolInfo as meteoraGetPoolInfo } from '../../connectors/meteora/amm-routes/poolInfo';
import { getPoolInfo as pancakeswapGetPoolInfo } from '../../connectors/pancakeswap/amm-routes/poolInfo';
import { getPoolInfo as raydiumGetPoolInfo } from '../../connectors/raydium/amm-routes/poolInfo';
import { getPoolInfo as uniswapGetPoolInfo } from '../../connectors/uniswap/amm-routes/poolInfo';
import { PoolInfo, PoolInfoSchema } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import { AMM_CONNECTORS, chainNetworkField, connectorField, resolveChainNetwork, rethrowRouteError } from '../common';

export const UnifiedAmmPoolInfoRequest = Type.Object(
  {
    connector: connectorField(AMM_CONNECTORS, 'AMM connector'),
    chainNetwork: chainNetworkField(),
    poolAddress: Type.String({ description: 'Pool contract address' }),
  },
  { $id: 'AmmPoolInfoRequest', additionalProperties: false },
);

/** Pool info from any AMM connector. Exported so the swap routes can learn a pool too. */
export async function getAmmPoolInfo(connector: string, network: string, poolAddress: string) {
  switch (connector) {
    case 'meteora':
      return await meteoraGetPoolInfo(network, poolAddress);
    case 'raydium':
      return await raydiumGetPoolInfo(network, poolAddress);
    case 'uniswap':
      return await uniswapGetPoolInfo(network, poolAddress);
    case 'pancakeswap':
      return await pancakeswapGetPoolInfo(network, poolAddress);
    default:
      throw httpErrors.badRequest(`Unsupported AMM connector: ${connector}. Supported: ${AMM_CONNECTORS.join(', ')}`);
  }
}

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof UnifiedAmmPoolInfoRequest>;
    Reply: PoolInfo;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get AMM pool information from any supported connector',
        tags: ['/trading/amm'],
        querystring: UnifiedAmmPoolInfoRequest,
        response: { 200: PoolInfoSchema },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, poolAddress } = request.query;
        const { network } = resolveChainNetwork(chainNetwork, connector, 'amm');
        const poolInfo = await getAmmPoolInfo(connector, network, poolAddress);

        // Asking about a pool by address is the moment Gateway can learn it: the reply
        // already carries both token addresses and the fee, so recording it costs the
        // list read below and nothing more when it is already known.

        return poolInfo;
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to get AMM pool info');
      }
    },
  );
};

export default poolInfoRoute;

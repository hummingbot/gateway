import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getPoolInfo as meteoraGetPoolInfo } from '../../connectors/meteora/amm-routes/poolInfo';
import { getPoolInfo as pancakeswapGetPoolInfo } from '../../connectors/pancakeswap/amm-routes/poolInfo';
import { getPoolInfo as raydiumGetPoolInfo } from '../../connectors/raydium/amm-routes/poolInfo';
import { getPoolInfo as uniswapGetPoolInfo } from '../../connectors/uniswap/amm-routes/poolInfo';
import { PoolInfo, PoolInfoSchema } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import { AMM_CONNECTORS, chainNetworkField, connectorField, parseChainNetwork, rethrowRouteError } from '../common';

const UnifiedAmmPoolInfoRequest = Type.Object({
  connector: connectorField(AMM_CONNECTORS, 'AMM connector'),
  chainNetwork: chainNetworkField(),
  poolAddress: Type.String({ description: 'Pool contract address' }),
});

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
        const { network } = parseChainNetwork(chainNetwork);
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
            throw httpErrors.badRequest(
              `Unsupported AMM connector: ${connector}. Supported: ${AMM_CONNECTORS.join(', ')}`,
            );
        }
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to get AMM pool info');
      }
    },
  );
};

export default poolInfoRoute;

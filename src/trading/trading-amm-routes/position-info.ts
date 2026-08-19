import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getPositionInfo as meteoraGetPositionInfo } from '../../connectors/meteora/amm-routes/positionInfo';
import { getPositionInfo as pancakeswapGetPositionInfo } from '../../connectors/pancakeswap/amm-routes/positionInfo';
import { getPositionInfo as raydiumGetPositionInfo } from '../../connectors/raydium/amm-routes/positionInfo';
import { getPositionInfo as uniswapGetPositionInfo } from '../../connectors/uniswap/amm-routes/positionInfo';
import { PositionInfo, PositionInfoSchema } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';
import { AMM_CONNECTORS, chainNetworkField, connectorField, defaultWallet, parseChainNetwork } from '../common';

const UnifiedAmmPositionInfoRequest = Type.Object({
  connector: connectorField(AMM_CONNECTORS, 'AMM connector'),
  chainNetwork: chainNetworkField(),
  poolAddress: Type.String({ description: 'Pool contract address' }),
  walletAddress: Type.String({ description: 'Wallet address', default: defaultWallet }),
});

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof UnifiedAmmPositionInfoRequest>;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: "Get a wallet's aggregated AMM liquidity in a pool from any supported connector",
        tags: ['/trading/amm'],
        querystring: UnifiedAmmPositionInfoRequest,
        response: { 200: PositionInfoSchema },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, poolAddress, walletAddress } = request.query;
        const { network } = parseChainNetwork(chainNetwork);
        switch (connector) {
          case 'meteora':
            return await meteoraGetPositionInfo(network, poolAddress, walletAddress);
          case 'raydium':
            return await raydiumGetPositionInfo(network, poolAddress, walletAddress);
          case 'uniswap':
            return await uniswapGetPositionInfo(network, poolAddress, walletAddress);
          case 'pancakeswap':
            return await pancakeswapGetPositionInfo(network, poolAddress, walletAddress);
          default:
            throw httpErrors.badRequest(
              `Unsupported AMM connector: ${connector}. Supported: ${AMM_CONNECTORS.join(', ')}`,
            );
        }
      } catch (e: any) {
        logger.error('Failed to get AMM position info:', e);
        if (e.statusCode) throw e;
        throw httpErrors.internalServerError('Failed to get position info');
      }
    },
  );
};

export default positionInfoRoute;

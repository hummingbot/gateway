import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getPositionsOwned as meteoraGetPositionsOwned } from '../../connectors/meteora/amm-routes/positionsOwned';
import { PositionInfo, PositionInfoSchema } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import {
  AMM_CONNECTORS,
  chainNetworkField,
  connectorField,
  defaultWallet,
  resolveChainNetwork,
  rethrowRouteError,
} from '../common';

export const UnifiedAmmPositionsOwnedRequest = Type.Object(
  {
    connector: connectorField(AMM_CONNECTORS, 'AMM connector (only non-fungible-LP AMMs supported: meteora)'),
    chainNetwork: chainNetworkField(),
    walletAddress: Type.String({ description: 'Wallet address to list positions for', default: defaultWallet }),
  },
  { $id: 'AmmPositionsOwnedRequest' },
);

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof UnifiedAmmPositionsOwnedRequest>;
    Reply: PositionInfo[];
  }>(
    '/positions-owned',
    {
      schema: {
        description:
          'List all AMM positions a wallet owns across pools. Supported only for non-fungible-LP AMMs ' +
          '(meteora DAMM v2). Fungible-LP AMMs (raydium, uniswap, pancakeswap) have no enumerable ' +
          'positions — use position-info with a specific pool address instead.',
        tags: ['/trading/amm'],
        querystring: UnifiedAmmPositionsOwnedRequest,
        response: { 200: Type.Array(PositionInfoSchema) },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, walletAddress } = request.query;
        const { network } = resolveChainNetwork(chainNetwork, connector, 'amm');
        switch (connector) {
          case 'meteora':
            return await meteoraGetPositionsOwned(fastify, network, walletAddress);
          case 'raydium':
          case 'uniswap':
          case 'pancakeswap':
            throw httpErrors.badRequest(
              `positions-owned is not supported for ${connector}: fungible-LP AMMs have no enumerable ` +
                'positions. Use position-info with a specific pool address instead.',
            );
          default:
            throw httpErrors.badRequest(
              `Unsupported AMM connector: ${connector}. Supported: ${AMM_CONNECTORS.join(', ')}`,
            );
        }
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to list AMM positions owned');
      }
    },
  );
};

export default positionsOwnedRoute;

import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { closePosition as meteoraClosePosition } from '../../connectors/meteora/clmm-routes/closePosition';
import { closePosition as orcaClosePosition } from '../../connectors/orca/clmm-routes/closePosition';
import { closePosition as pancakeswapClosePosition } from '../../connectors/pancakeswap/clmm-routes/closePosition';
import { closePosition as pancakeswapSolClosePosition } from '../../connectors/pancakeswap-sol/clmm-routes/closePosition';
import { closePosition as raydiumClosePosition } from '../../connectors/raydium/clmm-routes/closePosition';
import { closePosition as uniswapClosePosition } from '../../connectors/uniswap/clmm-routes/closePosition';
import { ClosePositionResponseType, ClosePositionResponse } from '../../schemas/clmm-schema';
import { httpErrors } from '../../services/error-handler';
import {
  chainNetworkField,
  CLMM_CONNECTORS,
  connectorField,
  defaultWallet,
  resolveChainNetwork,
  rethrowRouteError,
  slippagePctField,
  withIdentifiers,
} from '../common';

// Unified schema with connector field
export const UnifiedClosePositionRequest = Type.Object(
  {
    connector: connectorField(CLMM_CONNECTORS, 'CLMM connector'),
    chainNetwork: chainNetworkField(),
    walletAddress: Type.String({
      description: 'Wallet address',
      default: defaultWallet,
    }),
    positionAddress: Type.String({
      description: 'Position address',
      examples: ['<sample-position-address>'],
    }),
    slippagePct: slippagePctField(
      'Maximum acceptable slippage percentage for the withdrawal. Enforced by orca, uniswap ' +
        'and pancakeswap; meteora, raydium and pancakeswap-sol close with no minimum-amount ' +
        "check at all, so it changes nothing there. Defaults to the connector's configured " +
        'slippagePct.',
    ),
  },
  { $id: 'ClmmCloseRequest' },
);

// Import connector functions

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedClosePositionRequest>;
    Reply: ClosePositionResponseType;
  }>(
    '/close',
    {
      schema: {
        description: 'Close a CLMM position across supported connectors',
        tags: ['/trading/clmm'],
        body: UnifiedClosePositionRequest,
        response: {
          200: ClosePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, walletAddress, positionAddress, slippagePct } = request.body;

        // Parse chain and network from chainNetwork parameter
        const { network } = resolveChainNetwork(chainNetwork, connector, 'clmm');

        // Route to appropriate connector
        const result = await (async () => {
          switch (connector) {
            case 'uniswap':
              return await uniswapClosePosition(network, walletAddress, positionAddress, slippagePct);

            case 'pancakeswap':
              return await pancakeswapClosePosition(network, walletAddress, positionAddress, slippagePct);

            case 'raydium':
              return await raydiumClosePosition(network, walletAddress, positionAddress);

            case 'meteora':
              return await meteoraClosePosition(network, walletAddress, positionAddress);

            case 'pancakeswap-sol':
              return await pancakeswapSolClosePosition(network, walletAddress, positionAddress);

            case 'orca':
              return await orcaClosePosition(network, walletAddress, positionAddress, slippagePct);

            default:
              throw httpErrors.badRequest(`Unsupported connector: ${connector}`);
          }
        })();

        // poolAddress comes from the connector, which already loaded the position.
        return withIdentifiers(result, { positionAddress });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to close position');
      }
    },
  );
};

export default closePositionRoute;

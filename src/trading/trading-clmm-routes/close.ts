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
  BuildTransactionResponse,
  BuildTransactionResponseType,
  buildUnsigned,
  buildShapeFields,
  extraInstructionsField,
  priorityField,
} from '../build-common';
import {
  chainNetworkField,
  CLMM_CONNECTORS,
  connectorField,
  resolveWalletAddress,
  walletAddressField,
  resolveChainNetwork,
  rethrowRouteError,
  slippagePctField,
  withIdentifiers,
} from '../common';

// Unified schema with connector field
export const UnifiedClosePositionRequest = Type.Object(
  {
    connector: connectorField(CLMM_CONNECTORS, 'CLMM connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    walletAddress: walletAddressField('Wallet address'),
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
  { $id: 'ClmmCloseRequest', additionalProperties: false },
);

/** Same body as the execute route, plus the build-only extras. */
export const BuildClosePositionRequest = Type.Object(
  {
    ...UnifiedClosePositionRequest.properties,
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
  },
  { $id: 'ClmmBuildCloseRequest', additionalProperties: false },
);

async function dispatchClosePosition(
  connector: string,
  network: string,
  walletAddress: string,
  positionAddress: string,
  slippagePct?: number,
): Promise<ClosePositionResponseType> {
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
}

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof BuildClosePositionRequest>;
    Reply: BuildTransactionResponseType;
  }>(
    '/build-close',
    {
      schema: {
        description:
          'Build the unsigned transaction that /close would sign and send, for the caller to sign with ' +
          'its own wallet and broadcast via /chains/{chain}/submit. A close that spans several ' +
          'transactions (e.g. a wide Meteora position) returns the first; submit it and call build again.',
        tags: ['/trading/clmm'],
        body: BuildClosePositionRequest,
        response: {
          200: BuildTransactionResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          connector,
          chainNetwork,
          walletAddress: requestedWallet,
          positionAddress,
          slippagePct,
          extraInstructions,
          feePayer,
          format,
          memo,
          references,
          priority,
        } = request.body;
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'clmm');
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        return await buildUnsigned(
          chain,
          connector,
          { extraInstructions, feePayer, format, memo, references },
          () => dispatchClosePosition(connector, network, walletAddress, positionAddress, slippagePct),
          priority,
        );
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to build close-position transaction');
      }
    },
  );

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
        const { connector, chainNetwork, walletAddress: requestedWallet, positionAddress, slippagePct } = request.body;

        // Parse chain and network from chainNetwork parameter
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'clmm');
        const walletAddress = resolveWalletAddress(chain, requestedWallet);

        const result = await dispatchClosePosition(connector, network, walletAddress, positionAddress, slippagePct);

        // poolAddress comes from the connector, which already loaded the position.
        return withIdentifiers(result, { positionAddress });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to close position');
      }
    },
  );
};

export default closePositionRoute;

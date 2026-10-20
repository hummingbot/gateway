import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { collectFees as meteoraCollectFees } from '../../connectors/meteora/clmm-routes/collectFees';
import { collectFees as orcaCollectFees } from '../../connectors/orca/clmm-routes/collectFees';
import { collectFees as pancakeswapCollectFees } from '../../connectors/pancakeswap/clmm-routes/collectFees';
import { collectFees as pancakeswapSolCollectFees } from '../../connectors/pancakeswap-sol/clmm-routes/collectFees';
import { collectFees as raydiumCollectFees } from '../../connectors/raydium/clmm-routes/collectFees';
import { collectFees as uniswapCollectFees } from '../../connectors/uniswap/clmm-routes/collectFees';
import { CollectFeesResponseType, CollectFeesResponse } from '../../schemas/clmm-schema';
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
  withIdentifiers,
} from '../common';

// Unified schema with connector field
export const UnifiedCollectFeesRequest = Type.Object(
  {
    connector: connectorField(CLMM_CONNECTORS, 'CLMM connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    walletAddress: walletAddressField('Wallet address'),
    positionAddress: Type.String({
      description: 'Position address',
      examples: ['<sample-position-address>'],
    }),
  },
  { $id: 'ClmmCollectFeesRequest', additionalProperties: false },
);

/** Same body as the execute route, plus the build-only extras. */
export const BuildCollectFeesRequest = Type.Object(
  {
    ...UnifiedCollectFeesRequest.properties,
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
  },
  { $id: 'ClmmBuildCollectFeesRequest', additionalProperties: false },
);

async function dispatchCollectFees(
  connector: string,
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  switch (connector) {
    case 'uniswap':
      return await uniswapCollectFees(network, walletAddress, positionAddress);

    case 'pancakeswap':
      return await pancakeswapCollectFees(network, walletAddress, positionAddress);

    case 'raydium':
      return await raydiumCollectFees(network, walletAddress, positionAddress);

    case 'meteora':
      return await meteoraCollectFees(network, walletAddress, positionAddress);

    case 'pancakeswap-sol':
      return await pancakeswapSolCollectFees(network, walletAddress, positionAddress);

    case 'orca':
      return await orcaCollectFees(network, walletAddress, positionAddress);

    default:
      throw httpErrors.badRequest(`Unsupported connector: ${connector}`);
  }
}

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof BuildCollectFeesRequest>;
    Reply: BuildTransactionResponseType;
  }>(
    '/build-collect-fees',
    {
      schema: {
        description:
          'Build the unsigned transaction that /collect-fees would sign and send, for the caller to sign ' +
          'with its own wallet and broadcast via /chains/{chain}/submit.',
        tags: ['/trading/clmm'],
        body: BuildCollectFeesRequest,
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
          () => dispatchCollectFees(connector, network, walletAddress, positionAddress),
          priority,
        );
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to build collect-fees transaction');
      }
    },
  );

  fastify.post<{
    Body: Static<typeof UnifiedCollectFeesRequest>;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees from a CLMM position across supported connectors',
        tags: ['/trading/clmm'],
        body: UnifiedCollectFeesRequest,
        response: {
          200: CollectFeesResponse,
        },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, walletAddress: requestedWallet, positionAddress } = request.body;

        // Parse chain and network from chainNetwork parameter
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'clmm');
        const walletAddress = resolveWalletAddress(chain, requestedWallet);

        const result = await dispatchCollectFees(connector, network, walletAddress, positionAddress);

        // poolAddress comes from the connector, which already loaded the position.
        return withIdentifiers(result, { positionAddress });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to collect fees');
      }
    },
  );
};

export default collectFeesRoute;

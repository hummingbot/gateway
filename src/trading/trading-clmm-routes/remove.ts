import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { removeLiquidity as meteoraRemoveLiquidity } from '../../connectors/meteora/clmm-routes/removeLiquidity';
import { removeLiquidity as orcaRemoveLiquidity } from '../../connectors/orca/clmm-routes/removeLiquidity';
import { removeLiquidity as pancakeswapRemoveLiquidity } from '../../connectors/pancakeswap/clmm-routes/removeLiquidity';
import { removeLiquidity as pancakeswapSolRemoveLiquidity } from '../../connectors/pancakeswap-sol/clmm-routes/removeLiquidity';
import { removeLiquidity as raydiumRemoveLiquidity } from '../../connectors/raydium/clmm-routes/removeLiquidity';
import { removeLiquidity as uniswapRemoveLiquidity } from '../../connectors/uniswap/clmm-routes/removeLiquidity';
import { RemoveLiquidityResponseType, RemoveLiquidityResponse } from '../../schemas/clmm-schema';
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
  slippagePctField,
} from '../common';

// Unified schema with connector field
export const UnifiedRemoveLiquidityRequest = Type.Object(
  {
    connector: connectorField(CLMM_CONNECTORS, 'CLMM connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    walletAddress: walletAddressField('Wallet address'),
    positionAddress: Type.String({
      description: 'Position address',
      examples: ['<sample-position-address>'],
    }),
    percentageToRemove: Type.Number({
      format: 'decimal',
      minimum: 0,
      maximum: 100,
      description: 'Percentage of liquidity to remove',
      default: 100,
      examples: [100],
    }),
    // Orca-specific parameter (optional, ignored by other connectors, which manage
    // slippage internally).
    slippagePct: slippagePctField(
      'Maximum acceptable slippage percentage. Honored by orca, uniswap and pancakeswap; ' +
        "the other connectors remove at their configured slippagePct. Defaults to the connector's configured slippagePct.",
    ),
  },
  { $id: 'ClmmRemoveRequest', additionalProperties: false },
);

/** Same body as the execute route, plus the build-only extras. */
export const BuildRemoveLiquidityRequest = Type.Object(
  {
    ...UnifiedRemoveLiquidityRequest.properties,
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
  },
  { $id: 'ClmmBuildRemoveRequest', additionalProperties: false },
);

async function dispatchRemoveLiquidity(
  connector: string,
  network: string,
  walletAddress: string,
  positionAddress: string,
  percentageToRemove: number,
  slippagePct?: number,
): Promise<RemoveLiquidityResponseType> {
  switch (connector) {
    case 'uniswap':
      return await uniswapRemoveLiquidity(network, walletAddress, positionAddress, percentageToRemove, slippagePct);

    case 'pancakeswap':
      return await pancakeswapRemoveLiquidity(network, walletAddress, positionAddress, percentageToRemove, slippagePct);

    case 'raydium':
      return await raydiumRemoveLiquidity(network, walletAddress, positionAddress, percentageToRemove);

    case 'meteora':
      return await meteoraRemoveLiquidity(network, walletAddress, positionAddress, percentageToRemove);

    case 'pancakeswap-sol':
      return await pancakeswapSolRemoveLiquidity(network, walletAddress, positionAddress, percentageToRemove);

    case 'orca':
      return await orcaRemoveLiquidity(network, walletAddress, positionAddress, percentageToRemove, slippagePct);

    default:
      throw httpErrors.badRequest(`Unsupported connector: ${connector}`);
  }
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof BuildRemoveLiquidityRequest>;
    Reply: BuildTransactionResponseType;
  }>(
    '/build-remove',
    {
      schema: {
        description:
          'Build the unsigned transaction that /remove would sign and send, for the caller to sign with ' +
          'its own wallet and broadcast via /chains/{chain}/submit. A removal that spans several ' +
          'transactions returns the first; submit it and call build again.',
        tags: ['/trading/clmm'],
        body: BuildRemoveLiquidityRequest,
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
          percentageToRemove,
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
          () =>
            dispatchRemoveLiquidity(
              connector,
              network,
              walletAddress,
              positionAddress,
              percentageToRemove,
              slippagePct,
            ),
          priority,
        );
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to build remove-liquidity transaction');
      }
    },
  );

  fastify.post<{
    Body: Static<typeof UnifiedRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove',
    {
      schema: {
        description: 'Remove liquidity from a CLMM position across supported connectors',
        tags: ['/trading/clmm'],
        body: UnifiedRemoveLiquidityRequest,
        response: {
          200: RemoveLiquidityResponse,
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
          percentageToRemove,
          slippagePct,
        } = request.body;

        // Parse chain and network from chainNetwork parameter
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'clmm');
        const walletAddress = resolveWalletAddress(chain, requestedWallet);

        const result = await dispatchRemoveLiquidity(
          connector,
          network,
          walletAddress,
          positionAddress,
          percentageToRemove,
          slippagePct,
        );

        // poolAddress comes from the connector, which already loaded the position.
        return withIdentifiers(result, { positionAddress });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to remove liquidity');
      }
    },
  );
};

export default removeLiquidityRoute;

import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { removeLiquidity as meteoraRemoveLiquidity } from '../../connectors/meteora/amm-routes/removeLiquidity';
import { removeLiquidity as pancakeswapRemoveLiquidity } from '../../connectors/pancakeswap/amm-routes/removeLiquidity';
import { removeLiquidity as pumpRemoveLiquidity } from '../../connectors/pump/amm-routes/removeLiquidity';
import { removeLiquidity as raydiumRemoveLiquidity } from '../../connectors/raydium/amm-routes/removeLiquidity';
import { removeLiquidity as uniswapRemoveLiquidity } from '../../connectors/uniswap/amm-routes/removeLiquidity';
import { RemoveLiquidityResponse, RemoveLiquidityResponseType } from '../../schemas/amm-schema';
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
  AMM_CONNECTORS,
  chainNetworkField,
  connectorField,
  resolveWalletAddress,
  walletAddressField,
  resolveChainNetwork,
  rethrowRouteError,
  withIdentifiers,
  slippagePctField,
} from '../common';
import { learnPool } from '../learn-pool';

export const UnifiedAmmRemoveLiquidityRequest = Type.Object(
  {
    connector: connectorField(AMM_CONNECTORS, 'AMM connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    walletAddress: walletAddressField('Wallet address'),
    poolAddress: Type.String({ description: 'Pool contract address' }),
    positionAddress: Type.Optional(
      Type.String({
        'x-connectors': ['meteora'],
        description:
          'Required for meteora (DAMM v2 positions are NFTs): the specific position to remove from. ' +
          'List positions with position-info or positions-owned. Ignored by fungible-LP AMMs.',
      }),
    ),
    percentageToRemove: Type.Number({
      format: 'decimal',
      minimum: 0,
      maximum: 100,
      description: 'Percentage of liquidity to remove',
      default: 100,
      examples: [100],
    }),
    slippagePct: slippagePctField(),
  },
  { $id: 'AmmRemoveRequest', additionalProperties: false },
);

/** Same body as the execute route, plus the build-only extras. */
export const BuildAmmRemoveLiquidityRequest = Type.Object(
  {
    ...UnifiedAmmRemoveLiquidityRequest.properties,
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
  },
  { $id: 'AmmBuildRemoveRequest', additionalProperties: false },
);

async function dispatchAmmRemoveLiquidity(
  connector: string,
  network: string,
  walletAddress: string,
  poolAddress: string,
  percentageToRemove: number,
  slippagePct?: number,
  positionAddress?: string,
): Promise<RemoveLiquidityResponseType> {
  switch (connector) {
    case 'meteora':
      if (!positionAddress) {
        throw httpErrors.badRequest(
          'positionAddress is required for meteora: DAMM v2 positions are NFTs and a wallet may hold ' +
            'several per pool. List them with position-info or positions-owned.',
        );
      }
      return await meteoraRemoveLiquidity(
        network,
        walletAddress,
        poolAddress,
        positionAddress,
        percentageToRemove,
        slippagePct,
      );
    case 'pump':
      return await pumpRemoveLiquidity(network, walletAddress, poolAddress, percentageToRemove, slippagePct);
    case 'raydium':
      return await raydiumRemoveLiquidity(network, walletAddress, poolAddress, percentageToRemove, slippagePct);
    case 'uniswap':
      return await uniswapRemoveLiquidity(network, walletAddress, poolAddress, percentageToRemove, slippagePct);
    case 'pancakeswap':
      return await pancakeswapRemoveLiquidity(network, walletAddress, poolAddress, percentageToRemove, slippagePct);
    default:
      throw httpErrors.badRequest(`Unsupported AMM connector: ${connector}. Supported: ${AMM_CONNECTORS.join(', ')}`);
  }
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof BuildAmmRemoveLiquidityRequest>;
    Reply: BuildTransactionResponseType;
  }>(
    '/build-remove',
    {
      schema: {
        description:
          'Build the unsigned transaction that /remove would sign and send, for the caller to sign with ' +
          'its own wallet and broadcast via /chains/{chain}/submit.',
        tags: ['/trading/amm'],
        body: BuildAmmRemoveLiquidityRequest,
        response: { 200: BuildTransactionResponse },
      },
    },
    async (request) => {
      try {
        const {
          connector,
          chainNetwork,
          walletAddress: requestedWallet,
          poolAddress,
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
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'amm');
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        return await buildUnsigned(
          chain,
          connector,
          { extraInstructions, feePayer, format, memo, references },
          () =>
            dispatchAmmRemoveLiquidity(
              connector,
              network,
              walletAddress,
              poolAddress,
              percentageToRemove,
              slippagePct,
              positionAddress,
            ),
          priority,
        );
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to build remove-liquidity transaction');
      }
    },
  );

  fastify.post<{
    Body: Static<typeof UnifiedAmmRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove',
    {
      schema: {
        description: 'Remove liquidity from an AMM pool from any supported connector',
        tags: ['/trading/amm'],
        body: UnifiedAmmRemoveLiquidityRequest,
        response: { 200: RemoveLiquidityResponse },
      },
    },
    async (request) => {
      try {
        const {
          connector,
          chainNetwork,
          walletAddress: requestedWallet,
          poolAddress,
          positionAddress,
          percentageToRemove,
          slippagePct,
        } = request.body;
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'amm');
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        const result = await dispatchAmmRemoveLiquidity(
          connector,
          network,
          walletAddress,
          poolAddress,
          percentageToRemove,
          slippagePct,
          positionAddress,
        );

        // Funds moved through this pool, so it is worth naming next time.
        // Read-only routes deliberately do not do this; see learn-pool.ts.
        await learnPool(fastify, 'amm', chain, network, connector, chainNetwork, poolAddress);

        return withIdentifiers(result, { poolAddress, positionAddress });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to remove AMM liquidity');
      }
    },
  );
};

export default removeLiquidityRoute;

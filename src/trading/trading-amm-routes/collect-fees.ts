import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { collectFees as meteoraCollectFees } from '../../connectors/meteora/amm-routes/collectFees';
import { AmmCollectFeesResponse, AmmCollectFeesResponseType } from '../../schemas/amm-schema';
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
  connectorField,
  resolveChainNetwork,
  resolveWalletAddress,
  rethrowRouteError,
  walletAddressField,
  withIdentifiers,
} from '../common';

/**
 * AMMs whose positions hold their own fees. Meteora DAMM v2 positions accrue trading
 * fees apart from their liquidity; the fungible-LP AMMs (Raydium CPMM, PumpSwap,
 * Uniswap/PancakeSwap v2) compound fees into the pool, where a remove collects them.
 */
export const AMM_COLLECT_FEES_CONNECTORS = ['meteora'];

export const UnifiedAmmCollectFeesRequest = Type.Object(
  {
    connector: connectorField(AMM_COLLECT_FEES_CONNECTORS, 'AMM connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    walletAddress: walletAddressField('Wallet address'),
    poolAddress: Type.String({ description: 'Pool address' }),
    positionAddress: Type.String({
      description: 'The position whose fees to collect. List positions with position-info or positions-owned.',
    }),
  },
  { $id: 'AmmCollectFeesRequest', additionalProperties: false },
);

/** Same body as the execute route, plus the build-only extras. */
export const BuildAmmCollectFeesRequest = Type.Object(
  {
    ...UnifiedAmmCollectFeesRequest.properties,
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
  },
  { $id: 'AmmBuildCollectFeesRequest', additionalProperties: false },
);

async function dispatchAmmCollectFees(
  connector: string,
  network: string,
  walletAddress: string,
  poolAddress: string,
  positionAddress: string,
): Promise<AmmCollectFeesResponseType> {
  switch (connector) {
    case 'meteora':
      return await meteoraCollectFees(network, walletAddress, poolAddress, positionAddress);
    default:
      throw httpErrors.badRequest(
        `Unsupported connector for AMM collect-fees: ${connector}. Supported: ${AMM_COLLECT_FEES_CONNECTORS.join(', ')}`,
      );
  }
}

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof BuildAmmCollectFeesRequest>;
    Reply: BuildTransactionResponseType;
  }>(
    '/build-collect-fees',
    {
      schema: {
        description:
          'Build the unsigned transaction that /collect-fees would sign and send, for the caller to sign ' +
          'with its own wallet and broadcast via /chains/{chain}/submit.',
        tags: ['/trading/amm'],
        body: BuildAmmCollectFeesRequest,
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
          () => dispatchAmmCollectFees(connector, network, walletAddress, poolAddress, positionAddress),
          priority,
        );
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to build collect-fees transaction');
      }
    },
  );

  fastify.post<{
    Body: Static<typeof UnifiedAmmCollectFeesRequest>;
    Reply: AmmCollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description:
          "Collect an AMM position's trading fees into the wallet, leaving its liquidity in place " +
          '(meteora: DAMM v2 positions)',
        tags: ['/trading/amm'],
        body: UnifiedAmmCollectFeesRequest,
        response: { 200: AmmCollectFeesResponse },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, walletAddress: requestedWallet, poolAddress, positionAddress } = request.body;
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'amm');
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        const result = await dispatchAmmCollectFees(connector, network, walletAddress, poolAddress, positionAddress);
        return withIdentifiers(result, { poolAddress, positionAddress });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to collect AMM fees');
      }
    },
  );
};

export default collectFeesRoute;

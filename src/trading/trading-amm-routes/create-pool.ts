import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { createPool as meteoraCreatePool } from '../../connectors/meteora/amm-routes/createPool';
import { createPool as pancakeswapCreatePool } from '../../connectors/pancakeswap/amm-routes/createPool';
import { createPool as raydiumCreatePool } from '../../connectors/raydium/amm-routes/createPool';
import { createPool as uniswapCreatePool } from '../../connectors/uniswap/amm-routes/createPool';
import { CreatePoolRequest, CreatePoolResponse, CreatePoolResponseType } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import {
  AMM_CONNECTORS,
  chainNetworkField,
  connectorField,
  defaultWallet,
  parseChainNetwork,
  rethrowRouteError,
  slippagePctField,
} from '../common';

// Composed from the canonical CreatePoolRequest (schemas/amm-schema.ts): the
// unified route swaps per-connector `network` for connector + chainNetwork,
// defaults the wallet, and adds the per-protocol fee-config selectors.
const UnifiedCreatePoolRequest = Type.Composite([
  Type.Object({
    connector: connectorField(AMM_CONNECTORS, 'AMM connector'),
    chainNetwork: chainNetworkField(),
    walletAddress: Type.String({
      description: 'Wallet address (pool creator + payer)',
      default: defaultWallet,
    }),
  }),
  Type.Omit(CreatePoolRequest, ['network', 'walletAddress'], {}),
  // Optional per-protocol fee-config selectors, last so required fields lead the schema:
  Type.Object({
    configAddress: Type.Optional(
      Type.String({
        description:
          'Meteora DAMM v2 config account address (required for the meteora connector — configs are ' +
          'permissionless accounts with no index derivation, so the address must be explicit).',
      }),
    ),
    ammConfigIndex: Type.Optional(
      Type.Number({
        description: 'Raydium CPMM fee-config index (optional; defaults to the first available config).',
      }),
    ),
    slippagePct: slippagePctField(
      "Uniswap/PancakeSwap seeding slippage percentage. Defaults to the connector's configured slippagePct.",
    ),
  }),
]);

export const createPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedCreatePoolRequest>;
    Reply: CreatePoolResponseType;
  }>(
    '/create-pool',
    {
      schema: {
        description:
          'Create and seed a new AMM pool across supported connectors (Meteora DAMM v2, Raydium CPMM, ' +
          'Uniswap V2, PancakeSwap V2)',
        tags: ['/trading/amm'],
        body: UnifiedCreatePoolRequest,
        response: {
          200: CreatePoolResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          connector,
          chainNetwork,
          walletAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          initialPrice,
          configAddress,
          ammConfigIndex,
          slippagePct,
        } = request.body;

        const { network } = parseChainNetwork(chainNetwork);

        switch (connector) {
          case 'meteora':
            return await meteoraCreatePool(
              network,
              walletAddress,
              baseToken,
              quoteToken,
              baseTokenAmount,
              quoteTokenAmount,
              configAddress,
              initialPrice,
            );

          case 'raydium':
            return await raydiumCreatePool(
              network,
              walletAddress,
              baseToken,
              quoteToken,
              baseTokenAmount,
              quoteTokenAmount,
              initialPrice,
              ammConfigIndex,
            );

          case 'uniswap':
            return await uniswapCreatePool(
              network,
              walletAddress,
              baseToken,
              quoteToken,
              baseTokenAmount,
              quoteTokenAmount,
              initialPrice,
              slippagePct,
            );

          case 'pancakeswap':
            return await pancakeswapCreatePool(
              network,
              walletAddress,
              baseToken,
              quoteToken,
              baseTokenAmount,
              quoteTokenAmount,
              initialPrice,
              slippagePct,
            );

          default:
            throw httpErrors.badRequest(`Unsupported AMM connector: ${connector}`);
        }
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to create pool');
      }
    },
  );
};

export default createPoolRoute;

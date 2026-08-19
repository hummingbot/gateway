import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { createPool as meteoraCreatePool } from '../../connectors/meteora/clmm-routes/createPool';
import { createPool as orcaCreatePool } from '../../connectors/orca/clmm-routes/createPool';
import { createPool as pancakeswapCreatePool } from '../../connectors/pancakeswap/clmm-routes/createPool';
import { createPool as pancakeswapSolCreatePool } from '../../connectors/pancakeswap-sol/clmm-routes/createPool';
import { createPool as raydiumCreatePool } from '../../connectors/raydium/clmm-routes/createPool';
import { createPool as uniswapCreatePool } from '../../connectors/uniswap/clmm-routes/createPool';
import {
  CreatePoolResponse,
  CreatePoolResponseType,
  CreatePoolRequest as ClmmCreatePoolRequest,
} from '../../schemas/clmm-schema';
import { httpErrors } from '../../services/error-handler';
import {
  chainNetworkField,
  CLMM_CONNECTORS,
  connectorField,
  defaultWallet,
  parseChainNetwork,
  rethrowRouteError,
} from '../common';

// Unified CLMM create-pool. Creates + initializes a pool at an initial price (no position is
// seeded — concentrated-liquidity positions need a range, opened separately via open-position).
// Per-connector extras are optional and consumed only by their owning connector.
// Composed from the canonical ClmmCreatePoolRequest (schemas/clmm-schema.ts):
// the unified route swaps per-connector `network` for connector + chainNetwork
// and defaults the wallet.
const UnifiedClmmCreatePoolRequest = Type.Composite([
  Type.Object({
    connector: connectorField(CLMM_CONNECTORS, 'CLMM connector'),
    chainNetwork: chainNetworkField(),
    walletAddress: Type.String({ description: 'Wallet address (pool creator + payer)', default: defaultWallet }),
  }),
  Type.Omit(ClmmCreatePoolRequest, ['network', 'walletAddress'], {}),
]);

export const createPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedClmmCreatePoolRequest>;
    Reply: CreatePoolResponseType;
  }>(
    '/create-pool',
    {
      schema: {
        description:
          'Create and initialize a new CLMM pool across supported connectors (Meteora DLMM, Raydium CLMM, ' +
          'PancakeSwap Solana CLMM, Orca Whirlpool, Uniswap V3, PancakeSwap V3)',
        tags: ['/trading/clmm'],
        body: UnifiedClmmCreatePoolRequest,
        response: { 200: CreatePoolResponse },
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
          initialPrice,
          binStep,
          feeBps,
          ammConfigIndex,
        } = request.body;

        const { network } = parseChainNetwork(chainNetwork);

        // EVM V3 fee tiers are denominated in hundredths of a bip; feeBps is the
        // route's one fee vocabulary, so map it (1 bps -> 100).
        if ((connector === 'uniswap' || connector === 'pancakeswap') && feeBps === undefined) {
          throw httpErrors.badRequest(
            `feeBps is required for ${connector}: the V3 fee tier in basis points ` +
              '(1, 5, 30 or 100; pancakeswap also 25)',
          );
        }
        const evmFeeTier = feeBps === undefined ? undefined : feeBps * 100;

        switch (connector) {
          case 'meteora':
            return await meteoraCreatePool(
              network,
              walletAddress,
              baseToken,
              quoteToken,
              initialPrice,
              binStep,
              feeBps,
            );
          case 'raydium':
            return await raydiumCreatePool(network, walletAddress, baseToken, quoteToken, initialPrice, ammConfigIndex);
          case 'uniswap':
            return await uniswapCreatePool(network, walletAddress, baseToken, quoteToken, initialPrice, evmFeeTier);
          case 'orca':
            // Orca's fee tier IS its tick spacing — binStep is the route's one
            // granularity vocabulary.
            return await orcaCreatePool(network, walletAddress, baseToken, quoteToken, initialPrice, binStep);
          case 'pancakeswap':
            return await pancakeswapCreatePool(network, walletAddress, baseToken, quoteToken, initialPrice, evmFeeTier);
          case 'pancakeswap-sol':
            return await pancakeswapSolCreatePool(
              network,
              walletAddress,
              baseToken,
              quoteToken,
              initialPrice,
              ammConfigIndex,
            );
          default:
            throw httpErrors.badRequest(`Unsupported CLMM connector: ${connector}`);
        }
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to create CLMM pool');
      }
    },
  );
};

export default createPoolRoute;

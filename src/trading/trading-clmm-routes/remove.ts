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
  chainNetworkField,
  CLMM_CONNECTORS,
  connectorField,
  defaultWallet,
  parseChainNetwork,
  rethrowRouteError,
} from '../common';

// Unified schema with connector field
const UnifiedRemoveLiquidityRequest = Type.Object({
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
  percentageToRemove: Type.Number({
    minimum: 0,
    maximum: 100,
    description: 'Percentage of liquidity to remove',
    default: 100,
    examples: [100],
  }),
  // Orca-specific parameter (optional, ignored by other connectors, which manage
  // slippage internally).
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage. Only applies to the Orca connector.',
      default: 1,
      examples: [1],
    }),
  ),
});

// Import connector functions

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
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
        const { connector, chainNetwork, walletAddress, positionAddress, percentageToRemove, slippagePct } =
          request.body;

        // Parse chain and network from chainNetwork parameter
        const { network } = parseChainNetwork(chainNetwork);

        // Route to appropriate connector
        switch (connector) {
          case 'uniswap':
            return await uniswapRemoveLiquidity(network, walletAddress, positionAddress, percentageToRemove);

          case 'pancakeswap':
            return await pancakeswapRemoveLiquidity(network, walletAddress, positionAddress, percentageToRemove);

          case 'raydium':
            return await raydiumRemoveLiquidity(network, walletAddress, positionAddress, percentageToRemove);

          case 'meteora':
            return await meteoraRemoveLiquidity(network, walletAddress, positionAddress, percentageToRemove);

          case 'pancakeswap-sol':
            return await pancakeswapSolRemoveLiquidity(network, walletAddress, positionAddress, percentageToRemove);

          case 'orca':
            return await orcaRemoveLiquidity(
              network,
              walletAddress,
              positionAddress,
              percentageToRemove,
              slippagePct ?? 1,
            );

          default:
            throw httpErrors.badRequest(`Unsupported connector: ${connector}`);
        }
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to remove liquidity');
      }
    },
  );
};

export default removeLiquidityRoute;

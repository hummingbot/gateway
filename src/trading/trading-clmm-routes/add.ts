import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { addLiquidity as meteoraAddLiquidity } from '../../connectors/meteora/clmm-routes/addLiquidity';
import { addLiquidity as orcaAddLiquidity } from '../../connectors/orca/clmm-routes/addLiquidity';
import { addLiquidity as pancakeswapAddLiquidity } from '../../connectors/pancakeswap/clmm-routes/addLiquidity';
import { addLiquidity as pancakeswapSolAddLiquidity } from '../../connectors/pancakeswap-sol/clmm-routes/addLiquidity';
import { addLiquidity as raydiumAddLiquidity } from '../../connectors/raydium/clmm-routes/addLiquidity';
import { addLiquidity as uniswapAddLiquidity } from '../../connectors/uniswap/clmm-routes/addLiquidity';
import { AddLiquidityResponseType, AddLiquidityResponse } from '../../schemas/clmm-schema';
import { httpErrors } from '../../services/error-handler';
import {
  chainNetworkField,
  CLMM_CONNECTORS,
  connectorField,
  defaultWallet,
  parseChainNetwork,
  rethrowRouteError,
  withIdentifiers,
  slippagePctField,
} from '../common';

// Constants for examples (using Meteora CLMM values)
const BASE_TOKEN_AMOUNT = 0.01;
const QUOTE_TOKEN_AMOUNT = 2;

// Unified schema with connector field
export const UnifiedAddLiquidityRequest = Type.Object(
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
    baseTokenAmount: Type.Optional(
      Type.Number({
        format: 'decimal',
        description: 'Amount of base token to deposit (omit for single-sided quote deposit)',
        examples: [BASE_TOKEN_AMOUNT],
      }),
    ),
    quoteTokenAmount: Type.Optional(
      Type.Number({
        format: 'decimal',
        description: 'Amount of quote token to deposit (omit for single-sided base deposit)',
        examples: [QUOTE_TOKEN_AMOUNT],
      }),
    ),
    slippagePct: slippagePctField(),
    // Meteora-specific parameter (optional, ignored by other connectors). Without it an
    // add falls back to the connector-config default shape, which can silently differ
    // from the shape the position was opened with.
    strategyType: Type.Optional(
      Type.Number({
        'x-connectors': ['meteora'],
        description: 'Strategy type for Meteora positions (0=Spot, 1=Curve). Only applies to Meteora connector.',
        examples: [0],
      }),
    ),
  },
  { $id: 'ClmmAddRequest' },
);

// Import connector functions

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add',
    {
      schema: {
        description: 'Add liquidity to an existing CLMM position across supported connectors',
        tags: ['/trading/clmm'],
        body: UnifiedAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          connector,
          chainNetwork,
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          strategyType,
        } = request.body;

        // Parse chain and network from chainNetwork parameter
        const { network } = parseChainNetwork(chainNetwork);

        // Single-sided deposits are valid; the omitted side deposits 0.
        const baseAmount = baseTokenAmount ?? 0;
        const quoteAmount = quoteTokenAmount ?? 0;
        if (baseAmount <= 0 && quoteAmount <= 0) {
          throw httpErrors.badRequest('At least one of baseTokenAmount or quoteTokenAmount must be greater than 0');
        }

        // Route to appropriate connector
        const result = await (async () => {
          switch (connector) {
            case 'uniswap':
              return await uniswapAddLiquidity(
                network,
                walletAddress,
                positionAddress,
                baseAmount,
                quoteAmount,
                slippagePct,
              );

            case 'pancakeswap':
              return await pancakeswapAddLiquidity(
                network,
                walletAddress,
                positionAddress,
                baseAmount,
                quoteAmount,
                slippagePct,
              );

            case 'raydium':
              return await raydiumAddLiquidity(
                network,
                walletAddress,
                positionAddress,
                baseAmount,
                quoteAmount,
                slippagePct,
              );

            case 'meteora':
              return await meteoraAddLiquidity(
                network,
                walletAddress,
                positionAddress,
                baseAmount,
                quoteAmount,
                slippagePct,
                strategyType,
              );

            case 'pancakeswap-sol':
              return await pancakeswapSolAddLiquidity(
                network,
                walletAddress,
                positionAddress,
                baseAmount,
                quoteAmount,
                slippagePct,
              );

            case 'orca':
              return await orcaAddLiquidity(
                network,
                walletAddress,
                positionAddress,
                baseAmount,
                quoteAmount,
                slippagePct,
              );

            default:
              throw httpErrors.badRequest(`Unsupported connector: ${connector}`);
          }
        })();

        // poolAddress comes from the connector, which already loaded the position.
        return withIdentifiers(result, { positionAddress });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to add liquidity');
      }
    },
  );
};

export default addLiquidityRoute;

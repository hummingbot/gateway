import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { openPosition as meteoraOpenPosition } from '../../connectors/meteora/clmm-routes/openPosition';
import { openPosition as orcaOpenPosition } from '../../connectors/orca/clmm-routes/openPosition';
import { openPosition as pancakeswapOpenPosition } from '../../connectors/pancakeswap/clmm-routes/openPosition';
import { openPosition as pancakeswapSolOpenPosition } from '../../connectors/pancakeswap-sol/clmm-routes/openPosition';
import { openPosition as raydiumOpenPosition } from '../../connectors/raydium/clmm-routes/openPosition';
import { openPosition as uniswapOpenPosition } from '../../connectors/uniswap/clmm-routes/openPosition';
import { OpenPositionResponseType, OpenPositionResponse } from '../../schemas/clmm-schema';
import { httpErrors } from '../../services/error-handler';
import {
  chainNetworkField,
  CLMM_CONNECTORS,
  connectorField,
  defaultWallet,
  resolveChainNetwork,
  rethrowRouteError,
  withIdentifiers,
  slippagePctField,
} from '../common';
import { learnPool } from '../learn-pool';

// Constants for examples (using Meteora CLMM values)
const BASE_TOKEN_AMOUNT = 0.01;
const QUOTE_TOKEN_AMOUNT = 2;
const LOWER_PRICE_BOUND = 150;
const UPPER_PRICE_BOUND = 250;
const CLMM_POOL_ADDRESS_EXAMPLE = '2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3';

// Unified schema with connector field
export const UnifiedOpenPositionRequest = Type.Object(
  {
    connector: connectorField(CLMM_CONNECTORS, 'CLMM connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    walletAddress: Type.String({
      description: 'Wallet address',
      default: defaultWallet,
    }),
    lowerPrice: Type.Number({
      format: 'decimal',
      description: 'Lower price bound for the position',
      examples: [LOWER_PRICE_BOUND],
    }),
    upperPrice: Type.Number({
      format: 'decimal',
      description: 'Upper price bound for the position',
      examples: [UPPER_PRICE_BOUND],
    }),
    poolAddress: Type.String({
      description: 'Pool address',
      examples: [CLMM_POOL_ADDRESS_EXAMPLE],
    }),
    baseTokenAmount: Type.Optional(
      Type.Number({
        format: 'decimal',
        description: 'Amount of base token to deposit',
        examples: [BASE_TOKEN_AMOUNT],
      }),
    ),
    quoteTokenAmount: Type.Optional(
      Type.Number({
        format: 'decimal',
        description: 'Amount of quote token to deposit',
        examples: [QUOTE_TOKEN_AMOUNT],
      }),
    ),
    slippagePct: slippagePctField(),
    // Meteora-specific parameter (optional, ignored by other connectors)
    strategyType: Type.Optional(
      Type.Number({
        'x-connectors': ['meteora'],
        description: 'Strategy type for Meteora positions (0=Spot, 1=Curve). Only applies to Meteora connector.',
        examples: [0],
      }),
    ),
  },
  { $id: 'ClmmOpenRequest', additionalProperties: false },
);

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedOpenPositionRequest>;
    Reply: OpenPositionResponseType;
  }>(
    '/open',
    {
      schema: {
        description: 'Open a new CLMM position across supported connectors',
        tags: ['/trading/clmm'],
        body: UnifiedOpenPositionRequest,
        response: {
          200: OpenPositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          connector,
          chainNetwork,
          walletAddress,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          strategyType,
        } = request.body;

        // Parse chain and network from chainNetwork parameter
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'clmm');

        // Same contract as add.ts: single-sided opens are valid, but at least one
        // side must be positive — reject here rather than deep in connector code.
        const baseAmount = baseTokenAmount ?? 0;
        const quoteAmount = quoteTokenAmount ?? 0;
        if (baseAmount <= 0 && quoteAmount <= 0) {
          throw httpErrors.badRequest('At least one of baseTokenAmount or quoteTokenAmount must be greater than 0');
        }

        // Route to appropriate connector
        const result = await (async () => {
          switch (connector) {
            case 'uniswap':
              return await uniswapOpenPosition(
                network,
                walletAddress,
                lowerPrice,
                upperPrice,
                poolAddress,
                baseTokenAmount,
                quoteTokenAmount,
                slippagePct,
              );

            case 'pancakeswap':
              return await pancakeswapOpenPosition(
                network,
                walletAddress,
                lowerPrice,
                upperPrice,
                poolAddress,
                baseTokenAmount,
                quoteTokenAmount,
                slippagePct,
              );

            case 'raydium':
              return await raydiumOpenPosition(
                network,
                walletAddress,
                lowerPrice,
                upperPrice,
                poolAddress,
                baseTokenAmount,
                quoteTokenAmount,
                slippagePct,
              );

            case 'meteora':
              return await meteoraOpenPosition(
                network,
                walletAddress,
                lowerPrice,
                upperPrice,
                poolAddress,
                baseTokenAmount,
                quoteTokenAmount,
                slippagePct,
                strategyType,
              );

            case 'pancakeswap-sol':
              return await pancakeswapSolOpenPosition(
                network,
                walletAddress,
                poolAddress,
                lowerPrice,
                upperPrice,
                baseTokenAmount,
                quoteTokenAmount,
                slippagePct,
              );

            case 'orca':
              return await orcaOpenPosition(
                network,
                walletAddress,
                poolAddress,
                lowerPrice,
                upperPrice,
                baseTokenAmount,
                quoteTokenAmount,
                slippagePct,
              );

            default:
              throw httpErrors.badRequest(`Unsupported connector: ${connector}`);
          }
        })();

        // Funds are now in this pool, so it is worth naming next time. Read-only
        // routes deliberately do not do this; see learn-pool.ts.
        await learnPool(fastify, 'clmm', chain, network, connector, chainNetwork, poolAddress);

        return withIdentifiers(result, { poolAddress });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to open position');
      }
    },
  );
};

export default openPositionRoute;

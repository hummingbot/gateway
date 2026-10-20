import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../chains/solana/solana';
import { addLiquidity as meteoraAddLiquidity } from '../../connectors/meteora/clmm-routes/addLiquidity';
import { addLiquidity as orcaAddLiquidity } from '../../connectors/orca/clmm-routes/addLiquidity';
import { addLiquidity as pancakeswapAddLiquidity } from '../../connectors/pancakeswap/clmm-routes/addLiquidity';
import { addLiquidity as pancakeswapSolAddLiquidity } from '../../connectors/pancakeswap-sol/clmm-routes/addLiquidity';
import { addLiquidity as raydiumAddLiquidity } from '../../connectors/raydium/clmm-routes/addLiquidity';
import { addLiquidity as uniswapAddLiquidity } from '../../connectors/uniswap/clmm-routes/addLiquidity';
import { AddLiquidityResponseType, AddLiquidityResponse } from '../../schemas/clmm-schema';
import { httpErrors } from '../../services/error-handler';
import {
  assertBuildFields,
  assertBuildSupported,
  ChainBuildTransactionResponse,
  ChainBuildTransactionResponseType,
  buildUnsigned,
  buildShapeFields,
  extraInstructionsField,
  priorityField,
} from '../build-common';
import { getUnifiedPoolInfo } from '../clmm/pools';
import { getUnifiedPositionInfo } from '../clmm/positions';
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
import { lpPlatformFee, platformFeeField } from '../platform-fee';

// Constants for examples (using Meteora CLMM values)
const BASE_TOKEN_AMOUNT = 0.01;
const QUOTE_TOKEN_AMOUNT = 2;

// Unified schema with connector field
export const UnifiedAddLiquidityRequest = Type.Object(
  {
    connector: connectorField(CLMM_CONNECTORS, 'CLMM connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    walletAddress: walletAddressField('Wallet address'),
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
  { $id: 'ClmmAddRequest', additionalProperties: false },
);

/** Same body as the execute route, plus the build-only extras. */
export const BuildAddLiquidityRequest = Type.Object(
  {
    ...UnifiedAddLiquidityRequest.properties,
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
    platformFee: platformFeeField(
      "A platform fee of bps of the deposit's value in the pool's quote token (quoteAmount + baseAmount × the " +
        "pool's price, read at build time), paid to recipient in the quote token after the deposit.",
    ),
  },
  { $id: 'ClmmBuildAddRequest', additionalProperties: false },
);

type AddLiquidityParams = {
  network: string;
  walletAddress: string;
  positionAddress: string;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  slippagePct?: number;
  strategyType?: number;
};

async function dispatchAddLiquidity(connector: string, p: AddLiquidityParams): Promise<AddLiquidityResponseType> {
  switch (connector) {
    case 'uniswap':
      return await uniswapAddLiquidity(
        p.network,
        p.walletAddress,
        p.positionAddress,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
      );

    case 'pancakeswap':
      return await pancakeswapAddLiquidity(
        p.network,
        p.walletAddress,
        p.positionAddress,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
      );

    case 'raydium':
      return await raydiumAddLiquidity(
        p.network,
        p.walletAddress,
        p.positionAddress,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
      );

    case 'meteora':
      return await meteoraAddLiquidity(
        p.network,
        p.walletAddress,
        p.positionAddress,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
        p.strategyType,
      );

    case 'pancakeswap-sol':
      return await pancakeswapSolAddLiquidity(
        p.network,
        p.walletAddress,
        p.positionAddress,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
      );

    case 'orca':
      return await orcaAddLiquidity(
        p.network,
        p.walletAddress,
        p.positionAddress,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
      );

    default:
      throw httpErrors.badRequest(`Unsupported connector: ${connector}`);
  }
}

/** Single-sided deposits are valid; the omitted side deposits 0. */
function normalizeAddAmounts(baseTokenAmount?: number, quoteTokenAmount?: number): { base: number; quote: number } {
  const base = baseTokenAmount ?? 0;
  const quote = quoteTokenAmount ?? 0;
  if (base <= 0 && quote <= 0) {
    throw httpErrors.badRequest('At least one of baseTokenAmount or quoteTokenAmount must be greater than 0');
  }
  return { base, quote };
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof BuildAddLiquidityRequest>;
    Reply: ChainBuildTransactionResponseType;
  }>(
    '/build-add',
    {
      schema: {
        description:
          'Build the unsigned transaction that /add would sign and send, for the caller to sign with ' +
          'its own wallet and broadcast via /chains/{chain}/submit. A deposit into a Meteora position wider ' +
          'than one transaction returns its other chunks in followingTransactions; submit them in order.',
        tags: ['/trading/clmm'],
        body: BuildAddLiquidityRequest,
        response: {
          200: ChainBuildTransactionResponse,
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
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          strategyType,
          extraInstructions,
          feePayer,
          format,
          memo,
          references,
          priority,
          platformFee,
        } = request.body;
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'clmm');
        assertBuildFields(chain, { extraInstructions, feePayer, format, memo, references, priority, platformFee });
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        const { base, quote } = normalizeAddAmounts(baseTokenAmount, quoteTokenAmount);
        let fee;
        if (platformFee) {
          assertBuildSupported(connector, chain);
          // An add names its position; the price is its pool's.
          const position = await getUnifiedPositionInfo(fastify, connector, chainNetwork, positionAddress);
          const pool = await getUnifiedPoolInfo(fastify, connector, chainNetwork, position.poolAddress);
          fee = await lpPlatformFee(await Solana.getInstance(network), walletAddress, pool, base, quote, platformFee);
        }
        const built = await buildUnsigned(
          chain,
          connector,
          { extraInstructions, feePayer, format, memo, references },
          () =>
            dispatchAddLiquidity(connector, {
              network,
              walletAddress,
              positionAddress,
              baseTokenAmount: base,
              quoteTokenAmount: quote,
              slippagePct,
              strategyType,
            }),
          priority,
          fee?.platform,
        );
        return fee ? { ...built, platformFee: fee.charged } : built;
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to build add-liquidity transaction');
      }
    },
  );

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
          walletAddress: requestedWallet,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          strategyType,
        } = request.body;

        // Parse chain and network from chainNetwork parameter
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'clmm');
        const walletAddress = resolveWalletAddress(chain, requestedWallet);

        const { base, quote } = normalizeAddAmounts(baseTokenAmount, quoteTokenAmount);

        const result = await dispatchAddLiquidity(connector, {
          network,
          walletAddress,
          positionAddress,
          baseTokenAmount: base,
          quoteTokenAmount: quote,
          slippagePct,
          strategyType,
        });

        // poolAddress comes from the connector, which already loaded the position.
        return withIdentifiers(result, { positionAddress });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to add liquidity');
      }
    },
  );
};

export default addLiquidityRoute;

import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../chains/solana/solana';
import { openPosition as meteoraOpenPosition } from '../../connectors/meteora/clmm-routes/openPosition';
import { openPosition as orcaOpenPosition } from '../../connectors/orca/clmm-routes/openPosition';
import { openPosition as pancakeswapOpenPosition } from '../../connectors/pancakeswap/clmm-routes/openPosition';
import { openPosition as pancakeswapSolOpenPosition } from '../../connectors/pancakeswap-sol/clmm-routes/openPosition';
import { openPosition as raydiumOpenPosition } from '../../connectors/raydium/clmm-routes/openPosition';
import { openPosition as uniswapOpenPosition } from '../../connectors/uniswap/clmm-routes/openPosition';
import { OpenPositionResponseType, OpenPositionResponse } from '../../schemas/clmm-schema';
import { httpErrors } from '../../services/error-handler';
import {
  assertBuildSupported,
  BuildTransactionResponse,
  BuildTransactionResponseType,
  buildUnsigned,
  buildShapeFields,
  extraInstructionsField,
  priorityField,
} from '../build-common';
import { getUnifiedPoolInfo } from '../clmm/pools';
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
import { learnPool } from '../learn-pool';
import { lpPlatformFee, platformFeeField } from '../platform-fee';

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
    walletAddress: walletAddressField('Wallet address'),
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

/** Same body as the execute route, plus the build-only extras. */
export const BuildOpenPositionRequest = Type.Object(
  {
    ...UnifiedOpenPositionRequest.properties,
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
    platformFee: platformFeeField(
      "A platform fee of bps of the deposit's value in the pool's quote token (quoteAmount + baseAmount × the " +
        "pool's price, read at build time), paid to recipient in the quote token after the deposit.",
    ),
  },
  { $id: 'ClmmBuildOpenRequest', additionalProperties: false },
);

type OpenPositionParams = {
  network: string;
  walletAddress: string;
  lowerPrice: number;
  upperPrice: number;
  poolAddress: string;
  baseTokenAmount?: number;
  quoteTokenAmount?: number;
  slippagePct?: number;
  strategyType?: number;
};

/** Same contract as add.ts: single-sided opens are valid, but at least one side must be positive. */
function assertOpenAmounts(p: { baseTokenAmount?: number; quoteTokenAmount?: number }): void {
  if ((p.baseTokenAmount ?? 0) <= 0 && (p.quoteTokenAmount ?? 0) <= 0) {
    throw httpErrors.badRequest('At least one of baseTokenAmount or quoteTokenAmount must be greater than 0');
  }
}

async function dispatchOpenPosition(connector: string, p: OpenPositionParams): Promise<OpenPositionResponseType> {
  switch (connector) {
    case 'uniswap':
      return await uniswapOpenPosition(
        p.network,
        p.walletAddress,
        p.lowerPrice,
        p.upperPrice,
        p.poolAddress,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
      );

    case 'pancakeswap':
      return await pancakeswapOpenPosition(
        p.network,
        p.walletAddress,
        p.lowerPrice,
        p.upperPrice,
        p.poolAddress,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
      );

    case 'raydium':
      return await raydiumOpenPosition(
        p.network,
        p.walletAddress,
        p.lowerPrice,
        p.upperPrice,
        p.poolAddress,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
      );

    case 'meteora':
      return await meteoraOpenPosition(
        p.network,
        p.walletAddress,
        p.lowerPrice,
        p.upperPrice,
        p.poolAddress,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
        p.strategyType,
      );

    case 'pancakeswap-sol':
      return await pancakeswapSolOpenPosition(
        p.network,
        p.walletAddress,
        p.poolAddress,
        p.lowerPrice,
        p.upperPrice,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
      );

    case 'orca':
      return await orcaOpenPosition(
        p.network,
        p.walletAddress,
        p.poolAddress,
        p.lowerPrice,
        p.upperPrice,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
      );

    default:
      throw httpErrors.badRequest(`Unsupported connector: ${connector}`);
  }
}

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof BuildOpenPositionRequest>;
    Reply: BuildTransactionResponseType;
  }>(
    '/build-open',
    {
      schema: {
        description:
          'Build the unsigned transaction that /open would sign and send, for the caller to sign with ' +
          'its own wallet and broadcast via /chains/{chain}/submit. The position NFT mint has already ' +
          'partial-signed (its address is in extraSigners); sign the fee-payer slot as-is.',
        tags: ['/trading/clmm'],
        body: BuildOpenPositionRequest,
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
          extraInstructions,
          feePayer,
          format,
          memo,
          references,
          priority,
          platformFee,
          ...params
        } = request.body;
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'clmm');
        assertOpenAmounts(params);
        const walletAddress = resolveWalletAddress(chain, params.walletAddress);
        let fee;
        if (platformFee) {
          assertBuildSupported(connector, chain);
          const pool = await getUnifiedPoolInfo(fastify, connector, chainNetwork, params.poolAddress);
          fee = await lpPlatformFee(
            await Solana.getInstance(network),
            walletAddress,
            pool,
            params.baseTokenAmount,
            params.quoteTokenAmount,
            platformFee,
          );
        }
        const built = await buildUnsigned(
          chain,
          connector,
          { extraInstructions, feePayer, format, memo, references },
          () => dispatchOpenPosition(connector, { ...params, walletAddress, network }),
          priority,
          fee?.platform,
        );
        return fee ? { ...built, platformFee: fee.charged } : built;
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to build open-position transaction');
      }
    },
  );

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
        const { connector, chainNetwork, ...params } = request.body;

        // Parse chain and network from chainNetwork parameter
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'clmm');
        assertOpenAmounts(params);
        const walletAddress = resolveWalletAddress(chain, params.walletAddress);

        const result = await dispatchOpenPosition(connector, { ...params, walletAddress, network });

        // Funds are now in this pool, so it is worth naming next time. Read-only
        // routes deliberately do not do this; see learn-pool.ts.
        await learnPool(fastify, 'clmm', chain, network, connector, chainNetwork, params.poolAddress);

        return withIdentifiers(result, { poolAddress: params.poolAddress });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to open position');
      }
    },
  );
};

export default openPositionRoute;

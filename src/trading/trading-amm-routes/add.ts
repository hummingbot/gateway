import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../chains/solana/solana';
import { addLiquidity as meteoraAddLiquidity } from '../../connectors/meteora/amm-routes/addLiquidity';
import { addLiquidity as pancakeswapAddLiquidity } from '../../connectors/pancakeswap/amm-routes/addLiquidity';
import { addLiquidity as pumpAddLiquidity } from '../../connectors/pump/amm-routes/addLiquidity';
import { addLiquidity as raydiumAddLiquidity } from '../../connectors/raydium/amm-routes/addLiquidity';
import { addLiquidity as uniswapAddLiquidity } from '../../connectors/uniswap/amm-routes/addLiquidity';
import { AddLiquidityResponse, AddLiquidityResponseType } from '../../schemas/amm-schema';
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
import { lpPlatformFee, platformFeeField } from '../platform-fee';

import { getAmmPoolInfo } from './pool-info';

export const UnifiedAmmAddLiquidityRequest = Type.Object(
  {
    connector: connectorField(AMM_CONNECTORS, 'AMM connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    walletAddress: walletAddressField('Wallet address'),
    poolAddress: Type.String({ description: 'Pool contract address' }),
    baseTokenAmount: Type.Number({
      format: 'decimal',
      description: 'Amount of base token to add',
    }),
    quoteTokenAmount: Type.Number({
      format: 'decimal',
      description: 'Amount of quote token to add',
    }),
    positionAddress: Type.Optional(
      Type.String({
        'x-connectors': ['meteora'],
        description:
          'meteora only (DAMM v2 positions are NFTs): add to this specific position. Omit to open a new ' +
          'position. Ignored by fungible-LP AMMs.',
      }),
    ),
    slippagePct: slippagePctField(),
  },
  { $id: 'AmmAddRequest', additionalProperties: false },
);

/** Same body as the execute route, plus the build-only extras. */
export const BuildAmmAddLiquidityRequest = Type.Object(
  {
    ...UnifiedAmmAddLiquidityRequest.properties,
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
    platformFee: platformFeeField(
      "A platform fee of bps of the deposit's value in the pool's quote token (quoteAmount + baseAmount × the " +
        "pool's price, read at build time), paid to recipient in the quote token after the deposit.",
    ),
  },
  { $id: 'AmmBuildAddRequest', additionalProperties: false },
);

type AmmAddLiquidityParams = {
  network: string;
  walletAddress: string;
  poolAddress: string;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  slippagePct?: number;
  positionAddress?: string;
};

async function dispatchAmmAddLiquidity(connector: string, p: AmmAddLiquidityParams): Promise<AddLiquidityResponseType> {
  switch (connector) {
    case 'meteora':
      return await meteoraAddLiquidity(
        p.network,
        p.walletAddress,
        p.poolAddress,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
        p.positionAddress,
      );
    case 'pump':
      return await pumpAddLiquidity(
        p.network,
        p.walletAddress,
        p.poolAddress,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
      );
    case 'raydium':
      return await raydiumAddLiquidity(
        p.network,
        p.walletAddress,
        p.poolAddress,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
      );
    case 'uniswap':
      return await uniswapAddLiquidity(
        p.network,
        p.walletAddress,
        p.poolAddress,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
      );
    case 'pancakeswap':
      return await pancakeswapAddLiquidity(
        p.network,
        p.walletAddress,
        p.poolAddress,
        p.baseTokenAmount,
        p.quoteTokenAmount,
        p.slippagePct,
      );
    default:
      throw httpErrors.badRequest(`Unsupported AMM connector: ${connector}. Supported: ${AMM_CONNECTORS.join(', ')}`);
  }
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof BuildAmmAddLiquidityRequest>;
    Reply: ChainBuildTransactionResponseType;
  }>(
    '/build-add',
    {
      schema: {
        description:
          'Build the unsigned transaction that /add would sign and send, for the caller to sign with ' +
          'its own wallet and broadcast via /chains/{chain}/submit.',
        tags: ['/trading/amm'],
        body: BuildAmmAddLiquidityRequest,
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
          extraInstructions,
          feePayer,
          format,
          memo,
          references,
          priority,
          platformFee,
          ...params
        } = request.body;
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'amm');
        assertBuildFields(chain, { extraInstructions, feePayer, format, memo, references, priority, platformFee });
        const walletAddress = resolveWalletAddress(chain, params.walletAddress);
        let fee;
        if (platformFee) {
          assertBuildSupported(connector, chain);
          const pool = await getAmmPoolInfo(connector, network, params.poolAddress);
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
          () => dispatchAmmAddLiquidity(connector, { ...params, walletAddress, network }),
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
    Body: Static<typeof UnifiedAmmAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add',
    {
      schema: {
        description: 'Add liquidity to an AMM pool from any supported connector',
        tags: ['/trading/amm'],
        body: UnifiedAmmAddLiquidityRequest,
        response: { 200: AddLiquidityResponse },
      },
    },
    async (request) => {
      try {
        const {
          connector,
          chainNetwork,
          walletAddress: requestedWallet,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          positionAddress,
          slippagePct,
        } = request.body;
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'amm');
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        const result = await dispatchAmmAddLiquidity(connector, {
          network,
          walletAddress,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          positionAddress,
        });

        // Funds moved through this pool, so it is worth naming next time.
        // Read-only routes deliberately do not do this; see learn-pool.ts.
        await learnPool(fastify, 'amm', chain, network, connector, chainNetwork, poolAddress);

        return withIdentifiers(result, { poolAddress, positionAddress });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to add AMM liquidity');
      }
    },
  );
};

export default addLiquidityRoute;

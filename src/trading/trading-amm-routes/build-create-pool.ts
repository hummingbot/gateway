/**
 * POST /trading/amm/build-create-pool — the stateless half of create-pool.
 *
 * As with the CLMM route: the execute counterpart signs with Gateway's own
 * wallet, and this returns the unsigned transaction for the caller's user to
 * sign instead. An AMM pool is created WITH its initial liquidity, so this one
 * transaction both opens the pool and makes the first deposit — the amounts and
 * the ratio between them set the starting price.
 *
 * The position NFT the pool mints is an ephemeral signer, so it comes back in
 * `extraSigners` and /chains/solana/submit re-merges its signature.
 */
import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import {
  createPoolFromPrepared as meteoraCreatePoolFromPrepared,
  prepareCreatePool as meteoraPrepareCreatePool,
} from '../../connectors/meteora/amm-routes/createPool';
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
  rethrowRouteError,
  resolveWalletAddress,
  walletAddressField,
} from '../common';

/** AMM connectors whose create-pool is split into prepare + execute. */
const BUILDABLE_AMM_CREATE_POOL = ['meteora'] as const;

export const AmmBuildCreatePoolRequest = Type.Object(
  {
    connector: connectorField([...BUILDABLE_AMM_CREATE_POOL], 'AMM connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    walletAddress: walletAddressField('Wallet address (pool creator + payer)'),
    baseToken: Type.String({ description: 'Base token symbol or mint address' }),
    quoteToken: Type.String({ description: 'Quote token symbol or mint address' }),
    baseTokenAmount: Type.Number({ description: 'Base tokens to seed the pool with' }),
    quoteTokenAmount: Type.Optional(
      Type.Number({ description: 'Quote tokens to seed with. Its ratio to baseTokenAmount sets the initial price.' }),
    ),
    configAddress: Type.Optional(
      Type.String({
        description:
          'Meteora DAMM v2: the config account defining the fee tier. Required — many configs are launch ' +
          'configs with very high starting fees, so Gateway does not choose one for you.',
      }),
    ),
    initialPrice: Type.Optional(
      Type.Number({
        description: 'Initial price in quote per base. Overrides the amounts ratio; omit both to open on-market.',
      }),
    ),
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
  },
  { $id: 'AmmBuildCreatePoolRequest', additionalProperties: false },
);

export const AmmBuildCreatePoolResponse = Type.Composite(
  [
    BuildTransactionResponse,
    Type.Object({
      poolAddress: Type.String({ description: 'The address this transaction will create the pool at' }),
      price: Type.Number({ description: 'The price the pool will be seeded at, in quote per base' }),
    }),
  ],
  { $id: 'AmmBuildCreatePoolResponse' },
);

export const buildCreatePoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof AmmBuildCreatePoolRequest>;
    Reply: BuildTransactionResponseType & { poolAddress: string; price: number };
  }>(
    '/build-create-pool',
    {
      schema: {
        description:
          'Build (never send) the transaction that creates an AMM pool and seeds it with its initial liquidity. ' +
          'Returns the unsigned transaction for the caller to sign, together with the address the pool will be ' +
          'created at and the price it will be seeded at. The position NFT rides extraSigners.',
        tags: ['/trading/amm'],
        body: AmmBuildCreatePoolRequest,
        response: { 200: AmmBuildCreatePoolResponse },
      },
    },
    async (request) => {
      try {
        const {
          connector,
          chainNetwork,
          walletAddress: requestedWallet,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          configAddress,
          initialPrice,
          extraInstructions,
          feePayer,
          format,
          memo,
          references,
          priority,
        } = request.body;
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'amm');
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        if (connector !== 'meteora') {
          throw httpErrors.badRequest(
            `create-pool cannot be built for '${connector}' yet — only ${BUILDABLE_AMM_CREATE_POOL.join(', ')}. ` +
              "The others still create a pool in one indivisible step that signs with Gateway's wallet.",
          );
        }
        const prepared = await meteoraPrepareCreatePool(
          network,
          walletAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          configAddress,
          initialPrice,
        );
        const built = await buildUnsigned(
          chain,
          connector,
          { extraInstructions, feePayer, format, memo, references },
          () => meteoraCreatePoolFromPrepared(network, walletAddress, prepared),
          priority,
        );
        return { ...built, poolAddress: prepared.poolAddress, price: prepared.seedPrice };
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to build create-pool transaction');
      }
    },
  );
};

export default buildCreatePoolRoute;

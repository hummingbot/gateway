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
import {
  createPoolFromPrepared as pancakeswapCreatePoolFromPrepared,
  prepareCreatePool as pancakeswapPrepareCreatePool,
} from '../../connectors/pancakeswap/amm-routes/createPool';
import {
  createPoolFromPrepared as uniswapCreatePoolFromPrepared,
  prepareCreatePool as uniswapPrepareCreatePool,
} from '../../connectors/uniswap/amm-routes/createPool';
import { httpErrors } from '../../services/error-handler';
import {
  assertBuildFields,
  BuildTransactionResponse,
  buildUnsigned,
  ChainBuildTransactionResponseType,
  EvmBuildTransactionResponse,
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
const BUILDABLE_AMM_CREATE_POOL = ['meteora', 'uniswap', 'pancakeswap'] as const;

/** The EVM V2 create-pools, split the same way: prepare decides, fromPrepared sends. */
const EVM_CREATE_POOL: Record<
  string,
  { prepare: typeof uniswapPrepareCreatePool; fromPrepared: typeof uniswapCreatePoolFromPrepared }
> = {
  uniswap: { prepare: uniswapPrepareCreatePool, fromPrepared: uniswapCreatePoolFromPrepared },
  pancakeswap: { prepare: pancakeswapPrepareCreatePool, fromPrepared: pancakeswapCreatePoolFromPrepared },
};

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
    slippagePct: Type.Optional(
      Type.Number({ description: 'Uniswap/PancakeSwap V2: slippage on the seed deposit, in percent' }),
    ),
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
  },
  { $id: 'AmmBuildCreatePoolRequest', additionalProperties: false },
);

const CreatedPoolFields = Type.Object({
  poolAddress: Type.String({ description: 'The address this transaction will create the pool at' }),
  price: Type.Number({ description: 'The price the pool will be seeded at, in quote per base' }),
});

export const AmmBuildCreatePoolResponse = Type.Union(
  [
    Type.Composite([BuildTransactionResponse, CreatedPoolFields]),
    Type.Composite([EvmBuildTransactionResponse, CreatedPoolFields]),
  ],
  { $id: 'AmmBuildCreatePoolResponse' },
);

export const buildCreatePoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof AmmBuildCreatePoolRequest>;
    Reply: ChainBuildTransactionResponseType & { poolAddress: string; price: number };
  }>(
    '/build-create-pool',
    {
      schema: {
        description:
          'Build (never send) the transaction that creates an AMM pool and seeds it with its initial liquidity. ' +
          'Returns the unsigned transaction for the caller to sign, together with the address the pool will be ' +
          'created at and the price it will be seeded at. Meteora: the position NFT rides extraSigners. ' +
          'Uniswap/PancakeSwap V2: the router allowances the seed deposit needs come back as approvals.',
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
          slippagePct,
          extraInstructions,
          feePayer,
          format,
          memo,
          references,
          priority,
        } = request.body;
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'amm');
        assertBuildFields(chain, { extraInstructions, feePayer, format, memo, references, priority });
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        const shape = { extraInstructions, feePayer, format, memo, references };
        if (connector === 'meteora') {
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
            shape,
            () => meteoraCreatePoolFromPrepared(network, walletAddress, prepared),
            priority,
          );
          return { ...built, poolAddress: prepared.poolAddress, price: prepared.seedPrice };
        }
        const evm = EVM_CREATE_POOL[connector];
        if (!evm) {
          throw httpErrors.badRequest(
            `create-pool cannot be built for '${connector}' — only ${BUILDABLE_AMM_CREATE_POOL.join(', ')}.`,
          );
        }
        const prepared = await evm.prepare(
          network,
          walletAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          initialPrice,
          slippagePct,
        );
        const built = await buildUnsigned(chain, connector, shape, () =>
          evm.fromPrepared(network, walletAddress, prepared),
        );
        return { ...built, poolAddress: prepared.poolAddress, price: prepared.seedPrice };
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to build create-pool transaction');
      }
    },
  );
};

export default buildCreatePoolRoute;

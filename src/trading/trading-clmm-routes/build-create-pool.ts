/**
 * POST /trading/clmm/build-create-pool — the stateless half of create-pool.
 *
 * Every other create-pool route signs with Gateway's own wallet, which makes it
 * useless to a caller whose user holds the keys. This one returns the unsigned
 * transaction for that user to sign, like every other build-* route.
 *
 * Why it needs a prepare/execute split rather than just wrapping createPool: a
 * build is captured AT the signing chokepoint, and the pool's address is derived
 * before that point but only *returned* after it. So the route prepares first —
 * which is where the address and the seed price are decided — and then captures
 * the transaction the prepared values produce.
 *
 * Only connectors with a `prepare` are offered. A connector whose create-pool is
 * still one indivisible function would return a transaction with no address, and
 * a pool the caller cannot then find is worse than no route at all.
 */
import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import {
  createPoolFromPrepared as meteoraCreatePoolFromPrepared,
  prepareCreatePool as meteoraPrepareCreatePool,
} from '../../connectors/meteora/clmm-routes/createPool';
import {
  createPoolFromPrepared as pancakeswapCreatePoolFromPrepared,
  prepareCreatePool as pancakeswapPrepareCreatePool,
} from '../../connectors/pancakeswap/clmm-routes/createPool';
import {
  createPoolFromPrepared as uniswapCreatePoolFromPrepared,
  prepareCreatePool as uniswapPrepareCreatePool,
} from '../../connectors/uniswap/clmm-routes/createPool';
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

/** CLMM connectors whose create-pool is split into prepare + execute. */
const BUILDABLE_CLMM_CREATE_POOL = ['meteora', 'uniswap', 'pancakeswap'] as const;

/** The EVM V3 create-pools, split the same way: prepare decides, fromPrepared sends. */
const EVM_CREATE_POOL: Record<
  string,
  { prepare: typeof uniswapPrepareCreatePool; fromPrepared: typeof uniswapCreatePoolFromPrepared }
> = {
  uniswap: { prepare: uniswapPrepareCreatePool, fromPrepared: uniswapCreatePoolFromPrepared },
  pancakeswap: { prepare: pancakeswapPrepareCreatePool, fromPrepared: pancakeswapCreatePoolFromPrepared },
};

export const ClmmBuildCreatePoolRequest = Type.Object(
  {
    connector: connectorField([...BUILDABLE_CLMM_CREATE_POOL], 'CLMM connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    walletAddress: walletAddressField('Wallet address (pool creator + payer)'),
    baseToken: Type.String({ description: 'Base token symbol or mint address' }),
    quoteToken: Type.String({ description: 'Quote token symbol or mint address' }),
    initialPrice: Type.Optional(
      Type.Number({ description: 'Initial price in quote per base. Omit to open the pool at the live market price.' }),
    ),
    binStep: Type.Optional(
      Type.Number({
        description: 'Meteora DLMM: bin step in bps (1, 2, 4, 5, 10, 20, 25, 50, 100). Fixed at creation.',
      }),
    ),
    feeBps: Type.Optional(
      Type.Number({
        description:
          'Meteora DLMM: base fee in bps (20 = 0.20%). Uniswap/PancakeSwap V3: the fee tier in bps (required: ' +
          '1, 5, 30 or 100; PancakeSwap also 25). Fixed at creation.',
      }),
    ),
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
  },
  { $id: 'ClmmBuildCreatePoolRequest', additionalProperties: false },
);

/** The build payload plus what the pool will be — known before it exists. */
const CreatedPoolFields = Type.Object({
  poolAddress: Type.String({ description: 'The address this transaction will create the pool at' }),
  price: Type.Number({ description: 'The price the pool will be initialized at, in quote per base' }),
});

export const ClmmBuildCreatePoolResponse = Type.Union(
  [
    Type.Composite([BuildTransactionResponse, CreatedPoolFields]),
    Type.Composite([EvmBuildTransactionResponse, CreatedPoolFields]),
  ],
  { $id: 'ClmmBuildCreatePoolResponse' },
);

export const buildCreatePoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof ClmmBuildCreatePoolRequest>;
    Reply: ChainBuildTransactionResponseType & { poolAddress: string; price: number };
  }>(
    '/build-create-pool',
    {
      schema: {
        description:
          'Build (never send) the transaction that creates and initializes a CLMM pool. Returns the unsigned ' +
          'transaction for the caller to sign, together with the address the pool will be created at and the ' +
          'price it will be initialized at. No liquidity is seeded — open a position afterwards.',
        tags: ['/trading/clmm'],
        body: ClmmBuildCreatePoolRequest,
        response: { 200: ClmmBuildCreatePoolResponse },
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
          initialPrice,
          binStep,
          feeBps,
          extraInstructions,
          feePayer,
          format,
          memo,
          references,
          priority,
        } = request.body;
        const { chain, network } = resolveChainNetwork(chainNetwork, connector, 'clmm');
        assertBuildFields(chain, { extraInstructions, feePayer, format, memo, references, priority });
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        const shape = { extraInstructions, feePayer, format, memo, references };
        if (connector === 'meteora') {
          // Prepare first: this is where the pool address and the seed price are
          // decided, and it is the only place they can be read from, since the
          // capture below aborts before the execute path would return them.
          const prepared = await meteoraPrepareCreatePool(
            network,
            walletAddress,
            baseToken,
            quoteToken,
            initialPrice,
            binStep,
            feeBps,
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
            `create-pool cannot be built for '${connector}' — only ${BUILDABLE_CLMM_CREATE_POOL.join(', ')}.`,
          );
        }
        if (feeBps === undefined) {
          throw httpErrors.badRequest(
            `feeBps is required for ${connector}: the V3 fee tier in basis points (1, 5, 30 or 100; pancakeswap also 25)`,
          );
        }
        // V3 fee tiers are in hundredths of a bip (1 bps -> 100), as in /create-pool.
        const prepared = await evm.prepare(network, baseToken, quoteToken, initialPrice, feeBps * 100);
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

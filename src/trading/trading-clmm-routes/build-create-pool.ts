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

/** CLMM connectors whose create-pool is split into prepare + execute. */
const BUILDABLE_CLMM_CREATE_POOL = ['meteora'] as const;

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
      Type.Number({ description: 'Meteora DLMM: base fee in bps (20 = 0.20%). Fixed at creation.' }),
    ),
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
  },
  { $id: 'ClmmBuildCreatePoolRequest', additionalProperties: false },
);

/** The build payload plus what the pool will be — known before it exists. */
export const ClmmBuildCreatePoolResponse = Type.Composite(
  [
    BuildTransactionResponse,
    Type.Object({
      poolAddress: Type.String({ description: 'The address this transaction will create the pool at' }),
      price: Type.Number({ description: 'The price the pool will be initialized at, in quote per base' }),
    }),
  ],
  { $id: 'ClmmBuildCreatePoolResponse' },
);

export const buildCreatePoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof ClmmBuildCreatePoolRequest>;
    Reply: BuildTransactionResponseType & { poolAddress: string; price: number };
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
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        if (connector !== 'meteora') {
          throw httpErrors.badRequest(
            `create-pool cannot be built for '${connector}' yet — only ${BUILDABLE_CLMM_CREATE_POOL.join(', ')}. ` +
              "The others still create a pool in one indivisible step that signs with Gateway's wallet.",
          );
        }
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

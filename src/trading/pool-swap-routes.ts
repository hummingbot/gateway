/**
 * Swap routes for the pool-scoped trading surfaces.
 *
 * /trading/clmm/quote-swap and /trading/amm/quote-swap (and their execute-swap
 * counterparts) differ only in which registry they dispatch through and which
 * connectors they accept, so both are built from one factory. Keeping them
 * identical is the point: a caller moving between surfaces changes the path and
 * nothing else.
 */
import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../chains/solana/solana';
import { ChainExecuteSwapResponseSchema, ChainQuoteSwapResponseSchema } from '../schemas/chain-schema';
import { DecimalNumber } from '../schemas/decimal-field';
import { logger } from '../services/logger';

import {
  assertBuildSupported,
  BuildTransactionResponse,
  buildUnsigned,
  buildShapeFields,
  extraInstructionsField,
  priorityField,
} from './build-common';
import {
  chainNetworkField,
  connectorField,
  parseChainNetwork,
  resolveWalletAddress,
  poolAddressField,
  rethrowRouteError,
  resolvePoolAddress,
  resolveSwapConnector,
  slippagePctField,
  walletAddressField,
} from './common';
import { AMM_CONNECTORS, assertConnectorOnChain, CLMM_CONNECTORS, getPoolOps } from './connector-registry';
import { learnPool, PoolType } from './learn-pool';
import { appendedPlatformFee, platformFeeField, toPublicKey } from './platform-fee';

/**
 * Record the pool a swap ran against, and its two tokens, if Gateway does not know them.
 *
 * A swap reaches here with a pool address either because the caller pinned one — which
 * they only need to do for a pool that is *not* in the configured list — or because it
 * was resolved from that list, in which case this returns after one read. So the cost
 * falls exactly on the case that has something to learn, and only once per pool.
 */
const connectorsFor = (type: PoolType) => (type === 'clmm' ? CLMM_CONNECTORS : AMM_CONNECTORS);

const quoteSwapRequestSchema = (type: PoolType) =>
  Type.Object(
    {
      chainNetwork: chainNetworkField(),
      connector: Type.Optional(
        connectorField(connectorsFor(type), `${type.toUpperCase()} connector to price the swap against`),
      ),
      baseToken: Type.String({ description: 'Symbol or address of the base token', default: 'SOL' }),
      quoteToken: Type.String({ description: 'Symbol or address of the quote token', default: 'USDC' }),
      amount: Type.Number({
        format: 'decimal',
        description: 'Amount of base token to trade',
        default: 1,
      }),
      side: Type.String({
        description: 'BUY means buying base token with quote token, SELL means selling base token for quote token',
        enum: ['BUY', 'SELL'],
        default: 'SELL',
      }),
      poolAddress: poolAddressField(),
      slippagePct: slippagePctField(),
    },
    { $id: type === 'amm' ? 'AmmQuoteSwapRequest' : 'ClmmQuoteSwapRequest' },
  );

const executeSwapRequestSchema = (type: PoolType) =>
  Type.Object(
    {
      chainNetwork: chainNetworkField(),
      connector: Type.Optional(
        connectorField(connectorsFor(type), `${type.toUpperCase()} connector to execute the swap against`),
      ),
      walletAddress: walletAddressField('Wallet address that will execute the swap'),
      baseToken: Type.String({ description: 'Symbol or address of the base token', default: 'SOL' }),
      quoteToken: Type.String({ description: 'Symbol or address of the quote token', default: 'USDC' }),
      amount: Type.Number({
        format: 'decimal',
        description: 'Amount of base token to trade',
        default: 0.01,
      }),
      side: Type.String({
        description: 'BUY means buying base token with quote token, SELL means selling base token for quote token',
        enum: ['BUY', 'SELL'],
        default: 'SELL',
      }),
      poolAddress: poolAddressField(),
      slippagePct: slippagePctField(),
    },
    { $id: type === 'amm' ? 'AmmExecuteSwapRequest' : 'ClmmExecuteSwapRequest' },
  );

/**
 * One instance per pool type, because the `$id` above is what publishes these as spec
 * components and Fastify rejects the same `$id` twice. Built here rather than inside the
 * route factories so the route and the component registration share the object.
 *
 * The GET schema is published for the same reason as the POST one. Registering a schema
 * and referencing it are independent: `addSchema` puts it in `components.schemas`, while
 * @fastify/swagger still expands the querystring into `parameters` for the operation. So
 * the component is emitted with the fields a caller actually sends, and a generated
 * client gets a request model for the reads too — which is most of this API.
 */
export const QUOTE_SWAP_REQUEST_SCHEMAS = {
  amm: quoteSwapRequestSchema('amm'),
  clmm: quoteSwapRequestSchema('clmm'),
} as const;

export const EXECUTE_SWAP_REQUEST_SCHEMAS = {
  amm: executeSwapRequestSchema('amm'),
  clmm: executeSwapRequestSchema('clmm'),
} as const;

/** Same body as execute, plus the build-only extras (see build-common). */
const buildSwapRequestSchema = (type: PoolType) =>
  Type.Object(
    {
      ...executeSwapRequestSchema(type).properties,
      extraInstructions: extraInstructionsField(),
      ...buildShapeFields(),
      priority: priorityField(),
      platformFee: platformFeeField(
        'A platform fee of bps of the quoted input amount, in the input token, paid to recipient in the same ' +
          'transaction (after the swap). The input is quoted first: for a BUY, the quoted amountIn.',
      ),
    },
    { $id: type === 'amm' ? 'AmmBuildSwapRequest' : 'ClmmBuildSwapRequest' },
  );

export const BUILD_SWAP_REQUEST_SCHEMAS = {
  amm: buildSwapRequestSchema('amm'),
  clmm: buildSwapRequestSchema('clmm'),
} as const;

export const makeQuoteSwapRoute = (type: PoolType): FastifyPluginAsync => {
  const schema = QUOTE_SWAP_REQUEST_SCHEMAS[type];

  return async (fastify) => {
    fastify.get(
      '/quote-swap',
      {
        schema: {
          description: `Get a swap quote from a single ${type.toUpperCase()} pool`,
          tags: [`/trading/${type}`],
          querystring: schema,
          response: { 200: ChainQuoteSwapResponseSchema },
        },
      },
      async (request, reply) => {
        const { chainNetwork, connector, baseToken, quoteToken, amount, side, poolAddress, slippagePct } =
          request.query as Static<ReturnType<typeof quoteSwapRequestSchema>>;

        try {
          const { chain, network } = parseChainNetwork(chainNetwork);
          const name = resolveSwapConnector(chain, network, type, connector);
          assertConnectorOnChain(name, chain, type);
          const pool = await resolvePoolAddress(chain, network, type, name, baseToken, quoteToken, poolAddress);

          logger.info(
            `[trading/${type}] quote ${baseToken}-${quoteToken} on ${chain}/${network} via ${name} pool ${pool}`,
          );

          const result = await getPoolOps(name, chain, type).quoteSwap({
            network,
            poolAddress: pool,
            baseToken,
            side: side as 'BUY' | 'SELL',
            amount,
            slippagePct,
          });

          return reply.code(200).send(result);
        } catch (e: any) {
          rethrowRouteError(e, `Failed to get ${type} swap quote`);
        }
      },
    );
  };
};

/**
 * The unsigned transaction /execute-swap would have signed, for a caller that holds its
 * own key — a browser wallet comparing a router's price against one pool's and choosing
 * the pool. Without this, a pool quote is a number the caller can read and not act on.
 */
export const makeBuildSwapRoute = (type: PoolType): FastifyPluginAsync => {
  const schema = BUILD_SWAP_REQUEST_SCHEMAS[type];

  return async (fastify) => {
    fastify.post(
      '/build-swap',
      {
        schema: {
          description:
            `Build the unsigned transaction that /trading/${type}/execute-swap would sign and send, for ` +
            'the caller to sign with its own wallet and broadcast via /chains/{chain}/submit.',
          tags: [`/trading/${type}`],
          body: schema,
          response: { 200: BuildTransactionResponse },
        },
      },
      async (request) => {
        const {
          chainNetwork,
          connector,
          walletAddress: requestedWallet,
          baseToken,
          quoteToken,
          amount,
          side,
          poolAddress,
          slippagePct,
          extraInstructions,
          feePayer,
          format,
          memo,
          references,
          priority,
          platformFee,
        } = request.body as Static<ReturnType<typeof buildSwapRequestSchema>>;

        try {
          const { chain, network } = parseChainNetwork(chainNetwork);
          const name = resolveSwapConnector(chain, network, type, connector);
          assertConnectorOnChain(name, chain, type);
          const walletAddress = resolveWalletAddress(chain, requestedWallet);
          const pool = await resolvePoolAddress(chain, network, type, name, baseToken, quoteToken, poolAddress);

          logger.info(
            `[trading/${type}] build ${side} ${amount} ${baseToken}-${quoteToken} on ${chain}/${network} via ${name} pool ${pool}`,
          );

          let fee;
          if (platformFee) {
            assertBuildSupported(name, chain);
            // The fee is a share of the input, so the input is quoted first.
            const quote = await getPoolOps(name, chain, type).quoteSwap({
              network,
              poolAddress: pool,
              baseToken,
              side: side as 'BUY' | 'SELL',
              amount,
              slippagePct,
            });
            const solana = await Solana.getInstance(network);
            fee = await appendedPlatformFee(
              solana,
              toPublicKey(walletAddress, 'walletAddress'),
              toPublicKey(quote.tokenIn, 'quoted tokenIn'),
              Number(quote.amountIn),
              platformFee,
            );
          }

          const built = await buildUnsigned(
            chain,
            name,
            { extraInstructions, feePayer, format, memo, references },
            () =>
              getPoolOps(name, chain, type).executeSwap({
                network,
                walletAddress,
                poolAddress: pool,
                baseToken,
                side: side as 'BUY' | 'SELL',
                amount,
                slippagePct,
              }),
            priority,
            fee?.platform,
          );
          await learnPool(fastify, type, chain, network, name, chainNetwork, pool);
          return fee ? { ...built, platformFee: fee.charged } : built;
        } catch (e: any) {
          rethrowRouteError(e, `Failed to build ${type} swap transaction`);
        }
      },
    );
  };
};

export const makeExecuteSwapRoute = (type: PoolType): FastifyPluginAsync => {
  const schema = EXECUTE_SWAP_REQUEST_SCHEMAS[type];

  return async (fastify) => {
    fastify.post(
      '/execute-swap',
      {
        schema: {
          description: `Execute a swap against a single ${type.toUpperCase()} pool`,
          tags: [`/trading/${type}`],
          body: schema,
          response: { 200: ChainExecuteSwapResponseSchema },
        },
      },
      async (request, reply) => {
        const {
          chainNetwork,
          connector,
          walletAddress: requestedWallet,
          baseToken,
          quoteToken,
          amount,
          side,
          poolAddress,
          slippagePct,
        } = request.body as Static<ReturnType<typeof executeSwapRequestSchema>>;

        try {
          const { chain, network } = parseChainNetwork(chainNetwork);
          const walletAddress = resolveWalletAddress(chain, requestedWallet);
          const name = resolveSwapConnector(chain, network, type, connector);
          assertConnectorOnChain(name, chain, type);
          const pool = await resolvePoolAddress(chain, network, type, name, baseToken, quoteToken, poolAddress);

          logger.info(
            `[trading/${type}] execute ${side} ${amount} ${baseToken}-${quoteToken} on ${chain}/${network} via ${name} pool ${pool}`,
          );

          const result = await getPoolOps(name, chain, type).executeSwap({
            network,
            walletAddress,
            poolAddress: pool,
            baseToken,
            side: side as 'BUY' | 'SELL',
            amount,
            slippagePct,
          });
          await learnPool(fastify, type, chain, network, name, chainNetwork, pool);

          // This route resolved exactly one pool, so name it in the confirmed result.
          // Connectors report token flow but not the venue, which leaves a settled fill
          // unattributable without refetching the transaction. Only meaningful once
          // there is a `data` block — a pending swap has nothing to attribute yet.
          return reply
            .code(200)
            .send(result.data ? { ...result, data: { ...result.data, poolAddress: pool } } : result);
        } catch (e: any) {
          rethrowRouteError(e, `Failed to execute ${type} swap`);
        }
      },
    );
  };
};

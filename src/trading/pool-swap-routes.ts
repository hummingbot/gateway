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

import { ChainExecuteSwapResponseSchema, ChainQuoteSwapResponseSchema } from '../schemas/chain-schema';
import { logger } from '../services/logger';

import {
  chainNetworkField,
  connectorField,
  parseChainNetwork,
  poolAddressField,
  rethrowRouteError,
  resolvePoolAddress,
  resolveSwapConnector,
  slippagePctField,
  walletAddressField,
} from './common';
import { AMM_CONNECTORS, CLMM_CONNECTORS, getPoolOps } from './connector-registry';

type PoolType = 'clmm' | 'amm';

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
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side,
          poolAddress,
          slippagePct,
        } = request.body as Static<ReturnType<typeof executeSwapRequestSchema>>;

        try {
          const { chain, network } = parseChainNetwork(chainNetwork);
          const name = resolveSwapConnector(chain, network, type, connector);
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

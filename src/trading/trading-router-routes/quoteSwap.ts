import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { RouterQuoteSwapResponseSchema } from '../../schemas/chain-schema';
import { logger } from '../../services/logger';
import { ensureTokenSaved, recordQuietly } from '../../services/token-pool-autosave';
import {
  chainNetworkField,
  connectorField,
  parseChainNetwork,
  rethrowRouteError,
  resolveSwapConnector,
  slippagePctField,
} from '../common';
import {
  APPROXIMATE_IF_NO_EXACT_OUT_CONNECTORS,
  INDICATIVE_PRICE_CONNECTORS,
  ROUTER_CONNECTORS,
  getRouterOps,
} from '../connector-registry';

export const RouterQuoteSwapRequestSchema = Type.Object(
  {
    chainNetwork: chainNetworkField(),
    connector: Type.Optional(
      connectorField(ROUTER_CONNECTORS, "Router connector. Defaults to the network's swapProvider"),
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
    slippagePct: slippagePctField(),
    walletAddress: Type.Optional(
      Type.String({
        description:
          'Taker the quote is priced for. Required by routers that quote per-wallet or return wallet-specific calldata.',
      }),
    ),
    approximateIfNoExactOut: Type.Optional(
      Type.Boolean({
        description:
          'For BUY orders when the router has no ExactOut route: approximate via a sell-leg ExactIn quote instead of failing.',
        default: true,
        'x-connectors': APPROXIMATE_IF_NO_EXACT_OUT_CONNECTORS,
      } as any),
    ),
    // Deliberately no schema default: Fastify injects defaults before the handler
    // runs, so one here would shadow the connector's own.
    indicativePrice: Type.Optional(
      Type.Boolean({
        description:
          'Return an indicative price instead of a firm, executable quote. An indicative quote cannot be executed with /trading/router/execute-quote.',
        'x-connectors': INDICATIVE_PRICE_CONNECTORS,
      } as any),
    ),
  },
  { $id: 'RouterQuoteSwapRequest' },
);

type RouterQuoteSwapRequest = Static<typeof RouterQuoteSwapRequestSchema>;

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/quote-swap',
    {
      schema: {
        description: 'Get a swap quote from a router connector on any supported chain',
        tags: ['/trading/router'],
        querystring: RouterQuoteSwapRequestSchema,
        response: { 200: RouterQuoteSwapResponseSchema },
      },
    },
    async (request, reply) => {
      const {
        chainNetwork,
        connector,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        walletAddress,
        approximateIfNoExactOut,
        indicativePrice,
      } = request.query as RouterQuoteSwapRequest;

      try {
        const { chain, network } = parseChainNetwork(chainNetwork);
        const name = resolveSwapConnector(chain, network, 'router', connector);

        logger.info(`[trading/router] quote ${baseToken}-${quoteToken} on ${chain}/${network} via ${name}`);

        const result = await getRouterOps(name, chain).quoteSwap({
          network,
          baseToken,
          quoteToken,
          amount,
          side: side as 'BUY' | 'SELL',
          slippagePct,
          approximateIfNoExactOut,
          indicativePrice,
          walletAddress,
        });
        // A router swap names its tokens directly, so an address Gateway has never seen
        // is the only chance it gets to learn one. Symbols resolve from the list and cost
        // nothing here; an unknown address is read from the chain once and then known.
        await recordQuietly(
          Promise.all([ensureTokenSaved(chain, network, baseToken), ensureTokenSaved(chain, network, quoteToken)]),
          `tokens ${baseToken} and ${quoteToken}`,
        );

        return reply.code(200).send(result);
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to get swap quote');
      }
    },
  );
};

export default quoteSwapRoute;

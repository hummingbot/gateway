import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { ChainExecuteSwapResponseSchema } from '../../schemas/chain-schema';
import { logger } from '../../services/logger';
import { ensureTokenSaved, recordQuietly } from '../../services/token-pool-autosave';
import {
  chainNetworkField,
  connectorField,
  parseChainNetwork,
  rethrowRouteError,
  resolveSwapConnector,
  walletAddressField,
} from '../common';
import { ROUTER_CONNECTORS, getRouterOps } from '../connector-registry';

/**
 * Executing a cached quote is router-only: a quote id refers to route calldata the
 * router built and Gateway cached, which pool-scoped amm/clmm swaps have no
 * equivalent of — they price against a pool at execution time.
 */
export const RouterExecuteQuoteRequestSchema = Type.Object(
  {
    chainNetwork: chainNetworkField(),
    connector: Type.Optional(
      // No schema default: AJV injects defaults before the handler, so one here would
      // hand resolveSwapConnector the first router in the registry and the configured
      // swapProvider would never be consulted — including on Ethereum, where the first
      // router is a Solana connector.
      connectorField(ROUTER_CONNECTORS, "Router connector. Defaults to the network's swapProvider", {
        defaulted: false,
      }),
    ),
    walletAddress: walletAddressField('Wallet address that will execute the quote'),
    quoteId: Type.String({ description: 'ID of a quote returned by /trading/router/quote-swap' }),
  },
  { $id: 'RouterExecuteQuoteRequest', additionalProperties: false },
);

type RouterExecuteQuoteRequest = Static<typeof RouterExecuteQuoteRequestSchema>;

export const executeQuoteRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/execute-quote',
    {
      schema: {
        description: 'Execute a previously fetched router quote by its quote id',
        tags: ['/trading/router'],
        body: RouterExecuteQuoteRequestSchema,
        response: { 200: ChainExecuteSwapResponseSchema },
      },
    },
    async (request, reply) => {
      const { chainNetwork, connector, walletAddress, quoteId } = request.body as RouterExecuteQuoteRequest;

      try {
        const { chain, network } = parseChainNetwork(chainNetwork);
        const name = resolveSwapConnector(chain, network, 'router', connector);

        logger.info(`[trading/router] execute quote ${quoteId} on ${chain}/${network} via ${name}`);

        const result = await getRouterOps(name, chain).executeQuote(walletAddress, network, quoteId);

        // Same learning executeSwap does, from the only place this route can get the
        // tokens: the request carries a quote id, not a pair. `data` is present only on
        // a CONFIRMED swap and names both sides by ADDRESS, which is exactly what should
        // be recorded — a quote that was never executed teaches nothing, and a failed one
        // has nothing to teach.
        const swapped = (result as { data?: { tokenIn?: string; tokenOut?: string } })?.data;
        if (swapped?.tokenIn && swapped?.tokenOut) {
          await recordQuietly(
            Promise.all([
              ensureTokenSaved(chain, network, swapped.tokenIn),
              ensureTokenSaved(chain, network, swapped.tokenOut),
            ]),
            `tokens ${swapped.tokenIn} and ${swapped.tokenOut}`,
          );
        }

        return reply.code(200).send(result);
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to execute quote');
      }
    },
  );
};

export default executeQuoteRoute;

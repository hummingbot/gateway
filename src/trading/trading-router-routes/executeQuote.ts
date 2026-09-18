import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { ChainExecuteSwapResponseSchema } from '../../schemas/chain-schema';
import { logger } from '../../services/logger';
import { quoteCache } from '../../services/quote-cache';
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

/**
 * EIP-55 checksumming only changes the case of an EVM address, so a caller that quotes
 * with a checksummed address and executes with a lowercase one is naming one wallet.
 * Solana addresses are base58, where case carries value and must match exactly.
 */
const sameWallet = (chain: string, a: string, b: string): boolean =>
  chain === 'ethereum' ? a.toLowerCase() === b.toLowerCase() : a === b;

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

        // A quote id is a bearer token for a transaction someone else's wallet will pay
        // for. On Uniswap, PancakeSwap and 0x the taker named at quote time is compiled
        // into the calldata and cached with it, while the wallet that signs is whoever
        // this request names — so without this check, quoting with an address you do not
        // own and executing with one you do sends the output to the first and bills the
        // second, and Gateway reports it as a successful swap. Same shape for the network
        // and the connector: the cached calldata means nothing under a different router
        // or on a different chain.
        const binding = quoteCache.getBinding(quoteId);
        if (!binding) {
          throw fastify.httpErrors.badRequest('Quote not found or expired. Request a new quote.');
        }
        if (binding.connector !== name) {
          throw fastify.httpErrors.badRequest(
            `Quote ${quoteId} was created by ${binding.connector}, not ${name}. Execute it with connector=${binding.connector}.`,
          );
        }
        if (binding.network !== network) {
          throw fastify.httpErrors.badRequest(
            `Quote ${quoteId} was created on ${binding.network}, not ${network}. Execute it on ${binding.network}.`,
          );
        }
        if (binding.wallet !== null && !sameWallet(chain, binding.wallet, walletAddress)) {
          throw fastify.httpErrors.badRequest(
            `Quote ${quoteId} pays out to ${binding.wallet}, which is not the wallet executing it. ` +
              `Re-quote with walletAddress=${walletAddress}.`,
          );
        }

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

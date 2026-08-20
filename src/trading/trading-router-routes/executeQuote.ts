import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { ChainExecuteSwapResponseSchema } from '../../schemas/chain-schema';
import { logger } from '../../services/logger';
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
      connectorField(ROUTER_CONNECTORS, "Router connector. Defaults to the network's swapProvider"),
    ),
    walletAddress: walletAddressField('Wallet address that will execute the quote'),
    quoteId: Type.String({ description: 'ID of a quote returned by /trading/router/quote-swap' }),
  },
  { $id: 'RouterExecuteQuoteRequest' },
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
        return reply.code(200).send(result);
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to execute quote');
      }
    },
  );
};

export default executeQuoteRoute;

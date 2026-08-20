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
  slippagePctField,
  walletAddressField,
} from '../common';
import { APPROXIMATE_IF_NO_EXACT_OUT_CONNECTORS, ROUTER_CONNECTORS, getRouterOps } from '../connector-registry';

export const RouterExecuteSwapRequestSchema = Type.Object(
  {
    chainNetwork: chainNetworkField(),
    connector: Type.Optional(
      connectorField(ROUTER_CONNECTORS, "Router connector. Defaults to the network's swapProvider"),
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
    slippagePct: slippagePctField(),
    approximateIfNoExactOut: Type.Optional(
      Type.Boolean({
        description:
          'For BUY orders when the router has no ExactOut route: approximate via a sell-leg ExactIn swap instead of failing.',
        default: true,
        'x-connectors': APPROXIMATE_IF_NO_EXACT_OUT_CONNECTORS,
      } as any),
    ),
  },
  { $id: 'RouterExecuteSwapRequest' },
);

type RouterExecuteSwapRequest = Static<typeof RouterExecuteSwapRequestSchema>;

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/execute-swap',
    {
      schema: {
        description: 'Quote and execute a swap through a router connector on any supported chain',
        tags: ['/trading/router'],
        body: RouterExecuteSwapRequestSchema,
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
        slippagePct,
        approximateIfNoExactOut,
      } = request.body as RouterExecuteSwapRequest;

      try {
        const { chain, network } = parseChainNetwork(chainNetwork);
        const name = resolveSwapConnector(chain, network, 'router', connector);

        logger.info(
          `[trading/router] execute ${side} ${amount} ${baseToken}-${quoteToken} on ${chain}/${network} via ${name}`,
        );

        const result = await getRouterOps(name, chain).executeSwap({
          network,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side: side as 'BUY' | 'SELL',
          slippagePct,
          approximateIfNoExactOut,
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
        rethrowRouteError(e, 'Failed to execute swap');
      }
    },
  );
};

export default executeSwapRoute;

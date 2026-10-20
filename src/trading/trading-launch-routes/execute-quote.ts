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
  walletAddressField,
  resolveWalletAddress,
} from '../common';
import { LAUNCH_SWAP_CONNECTORS, getLaunchOps } from '../connector-registry';

export const LaunchExecuteQuoteRequestSchema = Type.Object(
  {
    chainNetwork: chainNetworkField(),
    connector: connectorField(LAUNCH_SWAP_CONNECTORS, 'Launchpad connector that issued the quote', {
      defaulted: false,
    }),
    walletAddress: walletAddressField('Wallet address that will execute the quote'),
    quoteId: Type.String({ description: 'ID of a quote returned by /trading/launch/quote-swap' }),
  },
  { $id: 'LaunchExecuteQuoteRequest', additionalProperties: false },
);

type LaunchExecuteQuoteRequest = Static<typeof LaunchExecuteQuoteRequestSchema>;

export const executeQuoteRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/execute-quote',
    {
      schema: {
        description: 'Execute a previously fetched launch-curve quote by its quote id',
        tags: ['/trading/launch'],
        body: LaunchExecuteQuoteRequestSchema,
        response: { 200: ChainExecuteSwapResponseSchema },
      },
    },
    async (request, reply) => {
      const {
        chainNetwork,
        connector,
        walletAddress: requestedWallet,
        quoteId,
      } = request.body as LaunchExecuteQuoteRequest;
      try {
        const { chain, network } = parseChainNetwork(chainNetwork);
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        logger.info(`[trading/launch] execute quote ${quoteId} on ${chain}/${network} via ${connector}`);
        const result = await getLaunchOps(connector, chain).executeQuote(walletAddress, network, quoteId);
        // The request carries a quote id, not a pair, so `data` on a CONFIRMED swap
        // is the only place the two token addresses can be learned from.
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
        rethrowRouteError(e, 'Failed to execute launch quote');
      }
    },
  );
};

export default executeQuoteRoute;

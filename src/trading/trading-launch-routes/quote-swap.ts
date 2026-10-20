import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { RouterQuoteSwapResponseSchema } from '../../schemas/chain-schema';
import { logger } from '../../services/logger';
import { chainNetworkField, connectorField, parseChainNetwork, rethrowRouteError, slippagePctField } from '../common';
import { LAUNCH_SWAP_CONNECTORS, getLaunchOps } from '../connector-registry';

/**
 * GET /trading/launch/quote-swap — price a trade on a launchpad's own curve.
 *
 * Shaped like the router surface rather than amm/clmm: a curve has exactly one
 * pool per launched token and it is found from the base mint, so the caller names
 * the token pair and there is no poolAddress to pin. Unlike the router surface
 * there is no configured default connector — a launchpad is chosen, never inferred.
 */
export const LaunchQuoteSwapRequestSchema = Type.Object(
  {
    chainNetwork: chainNetworkField(),
    connector: connectorField(LAUNCH_SWAP_CONNECTORS, 'Launchpad connector whose curve prices the swap', {
      defaulted: false,
    }),
    baseToken: Type.String({ description: 'Symbol or address of the launched token' }),
    quoteToken: Type.String({ description: "Symbol or address of the curve's quote currency", default: 'SOL' }),
    amount: Type.Number({
      format: 'decimal',
      description: 'BUY: amount of quote token to spend. SELL: amount of base token to sell. Both sides are exact-in.',
      default: 1,
    }),
    side: Type.String({
      description: 'BUY means buying the launched token with the quote currency, SELL means selling it back',
      enum: ['BUY', 'SELL'],
      default: 'BUY',
    }),
    slippagePct: slippagePctField(),
  },
  { $id: 'LaunchQuoteSwapRequest', additionalProperties: false },
);

type LaunchQuoteSwapRequest = Static<typeof LaunchQuoteSwapRequestSchema>;

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/quote-swap',
    {
      schema: {
        description: "Price a swap on a launchpad's bonding curve (Meteora DBC virtual pools, Raydium LaunchLab pools)",
        tags: ['/trading/launch'],
        querystring: LaunchQuoteSwapRequestSchema,
        response: { 200: RouterQuoteSwapResponseSchema },
      },
    },
    async (request, reply) => {
      const { chainNetwork, connector, baseToken, quoteToken, amount, side, slippagePct } =
        request.query as LaunchQuoteSwapRequest;
      try {
        const { chain, network } = parseChainNetwork(chainNetwork);
        logger.info(`[trading/launch] quote ${baseToken}-${quoteToken} on ${chain}/${network} via ${connector}`);
        const result = await getLaunchOps(connector, chain).quoteSwap({
          network,
          baseToken,
          quoteToken,
          amount,
          side: side as 'BUY' | 'SELL',
          slippagePct,
        });
        return reply.code(200).send(result);
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to get launch swap quote');
      }
    },
  );
};

export default quoteSwapRoute;

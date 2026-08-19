import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { quoteSwap as meteoraQuoteSwap } from '../../connectors/meteora/amm-routes/quoteSwap';
import { quoteSwap as pancakeswapQuoteSwap } from '../../connectors/pancakeswap/amm-routes/quoteSwap';
import { quoteSwap as raydiumQuoteSwap } from '../../connectors/raydium/amm-routes/quoteSwap';
import { quoteSwap as uniswapQuoteSwap } from '../../connectors/uniswap/amm-routes/quoteSwap';
import { QuoteSwapResponse, QuoteSwapResponseType } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import { AMM_CONNECTORS, chainNetworkField, connectorField, parseChainNetwork, rethrowRouteError } from '../common';

const UnifiedAmmQuoteSwapRequest = Type.Object({
  connector: connectorField(AMM_CONNECTORS, 'AMM connector'),
  chainNetwork: chainNetworkField(),
  poolAddress: Type.String({ description: 'Pool contract address' }),
  baseToken: Type.String({ description: 'Base token symbol or address (determines swap direction)' }),
  amount: Type.Number({ description: 'Amount denominated in the base token' }),
  side: Type.String({ description: 'Trade direction', enum: ['BUY', 'SELL'] }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: 1,
      examples: [1],
    }),
  ),
});

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof UnifiedAmmQuoteSwapRequest>;
    Reply: QuoteSwapResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get a swap quote against a specific AMM pool from any supported connector',
        tags: ['/trading/amm'],
        querystring: UnifiedAmmQuoteSwapRequest,
        response: { 200: QuoteSwapResponse },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, poolAddress, baseToken, amount, side, slippagePct } = request.query;
        const { network } = parseChainNetwork(chainNetwork);
        const s = side as 'BUY' | 'SELL';
        switch (connector) {
          case 'meteora':
            return await meteoraQuoteSwap(network, poolAddress, baseToken, s, amount, slippagePct);
          case 'raydium':
            return await raydiumQuoteSwap(network, poolAddress, baseToken, s, amount, slippagePct);
          case 'uniswap':
            return await uniswapQuoteSwap(network, poolAddress, baseToken, s, amount, slippagePct);
          case 'pancakeswap':
            return await pancakeswapQuoteSwap(network, poolAddress, baseToken, s, amount, slippagePct);
          default:
            throw httpErrors.badRequest(
              `Unsupported AMM connector: ${connector}. Supported: ${AMM_CONNECTORS.join(', ')}`,
            );
        }
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to get AMM swap quote');
      }
    },
  );
};

export default quoteSwapRoute;

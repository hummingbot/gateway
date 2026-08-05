import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { quoteSwap as meteoraQuoteSwap } from '../../connectors/meteora/amm-routes/quoteSwap';
import { quoteSwap as pancakeswapQuoteSwap } from '../../connectors/pancakeswap/amm-routes/quoteSwap';
import { quoteSwap as raydiumQuoteSwap } from '../../connectors/raydium/amm-routes/quoteSwap';
import { quoteSwap as uniswapQuoteSwap } from '../../connectors/uniswap/amm-routes/quoteSwap';
import { QuoteSwapResponse, QuoteSwapResponseType } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';

import { AMM_CONNECTORS, parseChainNetwork } from './common';

const UnifiedAmmQuoteSwapRequest = Type.Object({
  connector: Type.String({ description: 'AMM connector (meteora, raydium, uniswap)', default: 'meteora' }),
  chainNetwork: Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    default: 'solana-mainnet-beta',
  }),
  poolAddress: Type.String({ description: 'Pool contract address' }),
  baseToken: Type.String({ description: 'Base token symbol or address (determines swap direction)' }),
  amount: Type.Number({ description: 'Amount denominated in the base token' }),
  side: Type.String({ description: 'Trade direction', enum: ['BUY', 'SELL'] }),
  slippagePct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
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
        logger.error('Failed to get AMM swap quote:', e);
        if (e.statusCode) throw e;
        throw httpErrors.internalServerError('Failed to get swap quote');
      }
    },
  );
};

export default quoteSwapRoute;

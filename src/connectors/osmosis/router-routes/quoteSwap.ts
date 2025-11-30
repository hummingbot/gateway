import { FastifyPluginAsync } from 'fastify';

import { QuoteSwapResponseType, QuoteSwapResponse, QuoteSwapRequestType } from '../../../schemas/clmm-schema';
import { ConfigManagerV2 } from '../../../services/config-manager-v2';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';
import { quoteSwap } from '../osmosis.swap';

export const quoteSwapRoute: FastifyPluginAsync = async (fastify, _options) => {
  // Import the httpErrors plugin to ensure it's available
  await fastify.register(require('@fastify/sensible'));

  // Get first wallet address for example
  const walletAddressExample = await Osmosis.getWalletAddressExample();

  // Get available networks from osmosis configuration (same method as chain.routes.ts)
  const osmosisNetworks = ['testnet', 'mainnet'];

  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: QuoteSwapResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get a swap quote using Osmosis router',
        tags: ['/connectors/osmosis/swap'],
        querystring: {
          type: 'object',
          properties: {
            network: {
              type: 'string',
              default: 'mainnet',
              enum: osmosisNetworks,
            },
            baseToken: { type: 'string', examples: ['ION'] },
            quoteToken: { type: 'string', examples: ['OSMO'] },
            amount: { type: 'number', examples: [0.001] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [0.5] },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
          },
          required: ['baseToken', 'quoteToken', 'amount', 'side'],
        },
        response: {
          200: QuoteSwapResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        // Log the request parameters for debugging
        logger.info(`Received quote-swap request: ${JSON.stringify(request.query)}`);

        const {
          network,
          baseToken: baseTokenSymbol,
          quoteToken: quoteTokenSymbol,
          amount,
          side,
          slippagePct,
        } = request.query;

        // Validate essential parameters
        if (!baseTokenSymbol || !quoteTokenSymbol || !amount || !side || !network || !slippagePct) {
          logger.error('Missing required parameters in request');
          return reply.badRequest('Missing required parameters');
        }

        try {
          // Use our shared quote function
          const quoteResult = await quoteSwap(fastify, request.query, 'router');

          // Return only the data needed for the API response
          return {
            slippagePct: quoteResult.slippagePct,
            poolAddress: quoteResult.poolAddress,
            tokenIn: request.query.baseToken,
            tokenOut: request.query.quoteToken,
            amountIn: quoteResult.amountIn,
            amountOut: quoteResult.amountOut,
            price: quoteResult.price,
            minAmountOut: quoteResult.minAmountOut,
            maxAmountIn: quoteResult.maxAmountIn,
            priceImpactPct: quoteResult.priceImpactPct,
          };
        } catch (error) {
          // If the error already has a status code, it's a Fastify HTTP error
          if (error.statusCode) {
            throw error;
          }

          // Log more detailed information about the error
          logger.error(`Router error: ${error.message}`);
          if (error.stack) {
            logger.debug(`Error stack: ${error.stack}`);
          }

          // Check if there's any additional error details
          if (error.innerError) {
            logger.error(`Inner error: ${JSON.stringify(error.innerError)}`);
          }

          // Check if it's a specific error type from the Alpha Router
          if (error.name === 'SwapRouterError') {
            logger.error(`SwapRouterError details: ${JSON.stringify(error)}`);
          }

          return reply.badRequest(`Failed to get quote with router: ${error.message}`);
        }
      } catch (e) {
        logger.error(`Quote swap error: ${e.message}`);
        if (e.stack) {
          logger.debug(`Error stack: ${e.stack}`);
        }
        return reply.internalServerError(`Failed to get quote: ${e.message}`);
      }
    },
  );
};

export default quoteSwapRoute;

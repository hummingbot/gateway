import { FastifyPluginAsync } from 'fastify';

import executeQuoteRoute from './executeQuote';
import executeSwapRoute from './executeSwap';
import quoteSwapRoute from './quoteSwap';

/**
 * ETCswap Router routes
 *
 * Uses the Universal Router to find optimal swap paths across V2 and V3 pools.
 *
 * Endpoints:
 * - GET /quote-swap: Get a swap quote with optimal routing
 * - POST /execute-quote: Execute a previously fetched quote
 * - POST /execute-swap: Quote and execute a swap in one step
 */
export const etcswapRouterRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(quoteSwapRoute);
  await fastify.register(executeQuoteRoute);
  await fastify.register(executeSwapRoute);
};

export default etcswapRouterRoutes;

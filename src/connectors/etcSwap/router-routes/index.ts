import { FastifyPluginAsync } from 'fastify';

import executeQuoteRoute from './executeQuote';
import executeSwapRoute from './executeSwap';
import quoteSwapRoute from './quoteSwap';

export const etcSwapRouterRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(quoteSwapRoute);
  await fastify.register(executeQuoteRoute);
  await fastify.register(executeSwapRoute);
};

export default etcSwapRouterRoutes;

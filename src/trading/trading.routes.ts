import { FastifyPluginAsync } from 'fastify';

import { executeSwapRoute } from './swap/execute';
import { quoteSwapRoute } from './swap/quote';

export const tradingRoutes: FastifyPluginAsync = async (fastify) => {
  // Register swap routes
  fastify.register(quoteSwapRoute);
  fastify.register(executeSwapRoute);
};

export default tradingRoutes;

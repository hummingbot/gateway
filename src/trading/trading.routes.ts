import { FastifyPluginAsync } from 'fastify';

import { poolsRoute } from './clmm/pools';
import { positionsRoute } from './clmm/positions';
import { positionsOwnedRoute } from './clmm/positions-owned';
import { quotePositionRoute } from './clmm/quote-position';
import { executeSwapRoute } from './swap/execute';
import { quoteSwapRoute } from './swap/quote';
import {
  openPositionRoute,
  addLiquidityRoute,
  removeLiquidityRoute,
  collectFeesRoute,
  closePositionRoute,
} from './trading-clmm-routes';

export const tradingSwapRoutes: FastifyPluginAsync = async (fastify) => {
  // Register swap routes
  fastify.register(quoteSwapRoute);
  fastify.register(executeSwapRoute);
};

export const tradingClmmRoutes: FastifyPluginAsync = async (fastify) => {
  // Register CLMM query routes
  fastify.register(poolsRoute);
  fastify.register(positionsRoute);
  fastify.register(positionsOwnedRoute);
  fastify.register(quotePositionRoute);

  // Register CLMM transaction routes
  fastify.register(openPositionRoute);
  fastify.register(addLiquidityRoute);
  fastify.register(removeLiquidityRoute);
  fastify.register(collectFeesRoute);
  fastify.register(closePositionRoute);
};

// Legacy export for backward compatibility
export const tradingRoutes = tradingSwapRoutes;

export default tradingRoutes;

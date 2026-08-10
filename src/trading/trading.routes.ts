import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

import { poolsRoute } from './clmm/pools';
import { positionsRoute } from './clmm/positions';
import { positionsOwnedRoute } from './clmm/positions-owned';
import { quotePositionRoute } from './clmm/quote-position';
import { executeSwapRoute } from './swap/execute';
import { quoteSwapRoute } from './swap/quote';
import {
  createPoolRoute,
  poolInfoRoute as ammPoolInfoRoute,
  positionInfoRoute as ammPositionInfoRoute,
  positionsOwnedRoute as ammPositionsOwnedRoute,
  quoteSwapRoute as ammQuoteSwapRoute,
  executeSwapRoute as ammExecuteSwapRoute,
  quoteLiquidityRoute as ammQuoteLiquidityRoute,
  addLiquidityRoute as ammAddLiquidityRoute,
  removeLiquidityRoute as ammRemoveLiquidityRoute,
} from './trading-amm-routes';
import {
  openPositionRoute,
  addLiquidityRoute,
  removeLiquidityRoute,
  collectFeesRoute,
  closePositionRoute,
  createPoolRoute as clmmCreatePoolRoute,
} from './trading-clmm-routes';

export const tradingSwapRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  // Register swap routes
  fastify.register(quoteSwapRoute);
  fastify.register(executeSwapRoute);
};

export const tradingClmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

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
  fastify.register(clmmCreatePoolRoute);
};

export const tradingAmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  // Register AMM query routes (unified cross-connector)
  fastify.register(ammPoolInfoRoute);
  fastify.register(ammPositionInfoRoute);
  fastify.register(ammPositionsOwnedRoute);
  fastify.register(ammQuoteSwapRoute);
  fastify.register(ammQuoteLiquidityRoute);

  // Register AMM transaction routes (unified cross-connector)
  fastify.register(ammExecuteSwapRoute);
  fastify.register(ammAddLiquidityRoute);
  fastify.register(ammRemoveLiquidityRoute);
  fastify.register(createPoolRoute);
};

// Legacy export for backward compatibility
export const tradingRoutes = tradingSwapRoutes;

export default tradingRoutes;

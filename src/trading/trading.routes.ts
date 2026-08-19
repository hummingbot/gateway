import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

import { poolsRoute } from './clmm/pools';
import { positionsRoute } from './clmm/positions';
import { positionsOwnedRoute } from './clmm/positions-owned';
import { quoteLiquidityRoute } from './clmm/quote-liquidity';
import { makeExecuteSwapRoute, makeQuoteSwapRoute } from './pool-swap-routes';
import {
  createPoolRoute,
  openPositionRoute as ammOpenPositionRoute,
  closePositionRoute as ammClosePositionRoute,
  poolInfoRoute as ammPoolInfoRoute,
  positionInfoRoute as ammPositionInfoRoute,
  positionsOwnedRoute as ammPositionsOwnedRoute,
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
  fetchPoolsRoute,
} from './trading-clmm-routes';
import { quoteSwapRoute, executeQuoteRoute, executeSwapRoute } from './trading-router-routes';

/**
 * Router connectors (Jupiter, 0x, ...): quote-swap / execute-quote / execute-swap.
 * Mounted at /trading/router, exposing the same verb set the per-connector router
 * routes used to.
 */
export const tradingRouterRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  fastify.register(quoteSwapRoute);
  fastify.register(executeQuoteRoute);
  fastify.register(executeSwapRoute);
};

export const tradingClmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  // Query routes
  fastify.register(poolsRoute);
  fastify.register(positionsRoute);
  fastify.register(positionsOwnedRoute);
  fastify.register(quoteLiquidityRoute);
  fastify.register(fetchPoolsRoute);

  // Swap routes (single-pool swaps; execute-quote is router-only)
  fastify.register(makeQuoteSwapRoute('clmm'));
  fastify.register(makeExecuteSwapRoute('clmm'));

  // Liquidity transaction routes
  fastify.register(openPositionRoute);
  fastify.register(addLiquidityRoute);
  fastify.register(removeLiquidityRoute);
  fastify.register(collectFeesRoute);
  fastify.register(closePositionRoute);
  fastify.register(clmmCreatePoolRoute);
};

export const tradingAmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  // Query routes
  fastify.register(ammPoolInfoRoute);
  fastify.register(ammPositionInfoRoute);
  fastify.register(ammPositionsOwnedRoute);
  fastify.register(ammQuoteLiquidityRoute);

  // Swap routes (single-pool swaps; execute-quote is router-only)
  fastify.register(makeQuoteSwapRoute('amm'));
  fastify.register(makeExecuteSwapRoute('amm'));

  // Liquidity transaction routes
  fastify.register(ammOpenPositionRoute);
  fastify.register(ammAddLiquidityRoute);
  fastify.register(ammRemoveLiquidityRoute);
  fastify.register(ammClosePositionRoute);
  fastify.register(createPoolRoute);
};

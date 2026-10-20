import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

import { poolsRoute } from './clmm/pools';
import { positionsRoute } from './clmm/positions';
import { positionsOwnedRoute } from './clmm/positions-owned';
import { quoteLiquidityRoute } from './clmm/quote-liquidity';
import { makeBuildSwapRoute, makeExecuteSwapRoute, makeQuoteSwapRoute } from './pool-swap-routes';
import {
  createPoolRoute,
  buildCreatePoolRoute as ammBuildCreatePoolRoute,
  poolInfoRoute as ammPoolInfoRoute,
  positionInfoRoute as ammPositionInfoRoute,
  positionsOwnedRoute as ammPositionsOwnedRoute,
  quoteLiquidityRoute as ammQuoteLiquidityRoute,
  addLiquidityRoute as ammAddLiquidityRoute,
  removeLiquidityRoute as ammRemoveLiquidityRoute,
  collectFeesRoute as ammCollectFeesRoute,
} from './trading-amm-routes';
import {
  openPositionRoute,
  addLiquidityRoute,
  removeLiquidityRoute,
  collectFeesRoute,
  closePositionRoute,
  createPoolRoute as clmmCreatePoolRoute,
  buildCreatePoolRoute as clmmBuildCreatePoolRoute,
  fetchPoolsRoute,
} from './trading-clmm-routes';
import {
  createTokenRoute,
  poolInfoRoute as launchPoolInfoRoute,
  quoteSwapRoute as launchQuoteSwapRoute,
  executeSwapRoute as launchExecuteSwapRoute,
  executeQuoteRoute as launchExecuteQuoteRoute,
  buildSwapRoute as launchBuildSwapRoute,
  buildQuoteRoute as launchBuildQuoteRoute,
  creatorFeesRoute as launchCreatorFeesRoute,
  launchHistoryRoute,
} from './trading-launch-routes';
import {
  quoteSwapRoute,
  executeQuoteRoute,
  executeSwapRoute,
  buildSwapRoute,
  buildQuoteRoute,
} from './trading-router-routes';

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
  fastify.register(buildSwapRoute);
  fastify.register(buildQuoteRoute);
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
  fastify.register(makeBuildSwapRoute('clmm'));
  fastify.register(makeExecuteSwapRoute('clmm'));

  // Liquidity transaction routes
  fastify.register(openPositionRoute);
  fastify.register(addLiquidityRoute);
  fastify.register(removeLiquidityRoute);
  fastify.register(collectFeesRoute);
  fastify.register(closePositionRoute);
  fastify.register(clmmCreatePoolRoute);
  fastify.register(clmmBuildCreatePoolRoute);
};

/**
 * Launchpad connectors (pump.fun, Meteora DBC): token creation, and trading on the
 * curve the launch created. Mounted at /trading/launch.
 *
 * A bonding curve is a venue in its own right — one pool per launched token, found
 * from the base mint — so its swaps live here rather than on /trading/router, which
 * is for connectors that route across venues. The verb set mirrors the router one
 * because the arguments are the same shape (a token pair, no poolAddress to pin);
 * only the dispatch differs.
 */
export const tradingLaunchRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  fastify.register(createTokenRoute);

  // Venue state for a launchpad whose curve is a per-token account (Meteora DBC
  // virtual pools, LaunchLab pools, pump bonding curves): curve progress toward migration, price, accrued fees.
  fastify.register(launchPoolInfoRoute);

  // Trading on the curve, pre-migration.
  fastify.register(launchQuoteSwapRoute);
  fastify.register(launchExecuteSwapRoute);
  fastify.register(launchExecuteQuoteRoute);
  fastify.register(launchBuildSwapRoute);
  fastify.register(launchBuildQuoteRoute);

  // A creator's fees, read and claimed (pump: per creator, across its coins).
  fastify.register(launchCreatorFeesRoute);

  // A launch's ledger: creation and every trade, with the creator fee each paid.
  fastify.register(launchHistoryRoute);
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
  fastify.register(makeBuildSwapRoute('amm'));
  fastify.register(makeExecuteSwapRoute('amm'));

  // Liquidity transaction routes
  fastify.register(ammAddLiquidityRoute);
  fastify.register(ammRemoveLiquidityRoute);
  fastify.register(ammCollectFeesRoute);
  fastify.register(createPoolRoute);
  fastify.register(ammBuildCreatePoolRoute);
};

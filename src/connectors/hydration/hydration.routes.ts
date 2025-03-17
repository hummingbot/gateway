import type { FastifyPluginAsync } from 'fastify';
import sensible from '@fastify/sensible';

import { fetchPoolsRoute } from './routes/amm-routes/fetchPools';
import { poolInfoRoute } from './routes/amm-routes/poolInfo';
import { positionsOwnedRoute } from './routes/amm-routes/positionsOwned';
import { quoteSwapRoute } from './routes/amm-routes/quoteSwap';
import { positionInfoRoute } from './routes/amm-routes/positionInfo';
import { executeSwapRoute } from './routes/amm-routes/executeSwap';
import { openPositionRoute } from './routes/amm-routes/openPosition';
import { addLiquidityRoute } from './routes/amm-routes/addLiquidity';
import { removeLiquidityRoute } from './routes/amm-routes/removeLiquidity';
import { collectFeesRoute } from './routes/amm-routes/collectFees';
import { closePositionRoute } from './routes/amm-routes/closePosition';
import { quoteLiquidityRoute } from './routes/amm-routes/quoteLiquidity';

/**
 * Register all Hydration routes
 */
export const hydrationAMMRoutes: FastifyPluginAsync = async (fastify) => {
  // Register sensible plugin for better error handling
  await fastify.register(sensible);

  // Register all route handlers
  await fastify.register(fetchPoolsRoute);
  await fastify.register(poolInfoRoute);
  await fastify.register(positionsOwnedRoute);
  await fastify.register(positionInfoRoute);
  await fastify.register(quoteSwapRoute);
  await fastify.register(quoteLiquidityRoute);
  await fastify.register(executeSwapRoute);
  await fastify.register(openPositionRoute);
  await fastify.register(addLiquidityRoute);
  await fastify.register(removeLiquidityRoute);
  await fastify.register(collectFeesRoute);
  await fastify.register(closePositionRoute);
};

export const hydrationRoutes = {
  amm: hydrationAMMRoutes
};

export default hydrationRoutes;


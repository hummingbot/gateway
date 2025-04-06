import type { FastifyPluginAsync } from 'fastify';
import sensible from '@fastify/sensible';

// import { fetchPoolsRoute } from './routes/amm-routes/fetchPools';
import { poolInfoRoute } from './routes/amm-routes/poolInfo';
import { quoteSwapRoute } from './routes/amm-routes/quoteSwap';
import { executeSwapRoute } from './routes/amm-routes/executeSwap';
import { addLiquidityRoute } from './routes/amm-routes/addLiquidity';
import { removeLiquidityRoute } from './routes/amm-routes/removeLiquidity';
import { quoteLiquidityRoute } from './routes/amm-routes/quoteLiquidity';
import { listPoolsRoute } from './routes/amm-routes/listPools';

/**
 * Register all Hydration routes
 */
export const hydrationAMMRoutes: FastifyPluginAsync = async (fastify) => {
  // Register sensible plugin for better error handling
  await fastify.register(sensible);

  // Register all route handlers
  await fastify.register(listPoolsRoute);
  await fastify.register(poolInfoRoute);
  await fastify.register(quoteSwapRoute);
  await fastify.register(quoteLiquidityRoute);
  await fastify.register(executeSwapRoute);
  await fastify.register(addLiquidityRoute);
  await fastify.register(removeLiquidityRoute);
};

export const hydrationRoutes = {
  amm: hydrationAMMRoutes
};

export default hydrationRoutes;


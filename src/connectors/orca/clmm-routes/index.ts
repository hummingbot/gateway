import { FastifyPluginAsync } from 'fastify';

// Read-only routes (implemented)
import { collectFeesRoute } from './collectFees';
import { fetchPoolsRoute } from './fetchPools';
import { poolInfoRoute } from './poolInfo';
import { positionInfoRoute } from './positionInfo';
import { positionsOwnedRoute } from './positionsOwned';
import { quotePositionRoute } from './quotePosition';
import { quoteSwapRoute } from './quoteSwap';
import { removeLiquidityRoute } from './removeLiquidity';

// Transaction routes (deferred for later implementation)
// import { addLiquidityRoute } from './addLiquidity';
// import { closePositionRoute } from './closePosition';
// import { executeSwapRoute } from './executeSwap';
// import { openPositionRoute } from './openPosition';

export const orcaClmmRoutes: FastifyPluginAsync = async (fastify) => {
  // Register read-only routes
  await fastify.register(collectFeesRoute);
  await fastify.register(fetchPoolsRoute);
  await fastify.register(poolInfoRoute);
  await fastify.register(positionsOwnedRoute);
  await fastify.register(positionInfoRoute);
  await fastify.register(quotePositionRoute);
  await fastify.register(quoteSwapRoute);
  await fastify.register(removeLiquidityRoute);

  // Transaction routes (deferred)
  // await fastify.register(executeSwapRoute);
  // await fastify.register(openPositionRoute);
  // await fastify.register(addLiquidityRoute);

  // await fastify.register(closePositionRoute);
};

export default orcaClmmRoutes;

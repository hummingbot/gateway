import { FastifyPluginAsync } from 'fastify';

// Read-only routes (implemented)
import { addLiquidityRoute } from './addLiquidity';
import { closePositionRoute } from './closePosition';
import { collectFeesRoute } from './collectFees';
import { fetchPoolsRoute } from './fetchPools';
import { openPositionRoute } from './openPosition';
import { poolInfoRoute } from './poolInfo';
import { positionInfoRoute } from './positionInfo';
import { positionsOwnedRoute } from './positionsOwned';
import { quotePositionRoute } from './quotePosition';
import { quoteSwapRoute } from './quoteSwap';
import { removeLiquidityRoute } from './removeLiquidity';

// Transaction routes (deferred for later implementation)
// import { executeSwapRoute } from './executeSwap';

export const orcaClmmRoutes: FastifyPluginAsync = async (fastify) => {
  // Register read-only routes
  await fastify.register(fetchPoolsRoute);
  await fastify.register(poolInfoRoute);
  await fastify.register(positionsOwnedRoute);
  await fastify.register(positionInfoRoute);
  await fastify.register(quotePositionRoute);
  await fastify.register(quoteSwapRoute);
  await fastify.register(addLiquidityRoute);
  await fastify.register(collectFeesRoute);
  await fastify.register(removeLiquidityRoute);
  await fastify.register(closePositionRoute);
  await fastify.register(openPositionRoute);

  // Transaction routes (deferred)
  // await fastify.register(executeSwapRoute);
};

export default orcaClmmRoutes;

import { FastifyPluginAsync } from 'fastify';

import closePositionRoute from './closePosition';
import collectFeesRoute from './collectFees';
import executeSwapRoute from './executeSwap';
import poolInfoRoute from './poolInfo';
import positionInfoRoute from './positionInfo';
import positionsOwnedRoute from './positionsOwned';
import quoteSwapRoute from './quoteSwap';
import removeLiquidityRoute from './removeLiquidity';

export const pancakeswapSolClmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(poolInfoRoute);
  await fastify.register(positionInfoRoute);
  await fastify.register(positionsOwnedRoute);
  await fastify.register(quoteSwapRoute);
  await fastify.register(executeSwapRoute);
  await fastify.register(removeLiquidityRoute);
  await fastify.register(collectFeesRoute);
  await fastify.register(closePositionRoute);
  // Additional routes will be added here:
  // - quotePosition
  // - openPosition
  // - addLiquidity
};

export default pancakeswapSolClmmRoutes;

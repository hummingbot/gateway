import { FastifyPluginAsync } from 'fastify';

import executeSwapRoute from './executeSwap';
import poolInfoRoute from './poolInfo';
import positionInfoRoute from './positionInfo';
import positionsOwnedRoute from './positionsOwned';
import quoteSwapRoute from './quoteSwap';

export const pancakeswapSolClmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(poolInfoRoute);
  await fastify.register(positionInfoRoute);
  await fastify.register(positionsOwnedRoute);
  await fastify.register(quoteSwapRoute);
  await fastify.register(executeSwapRoute);
  // Additional routes will be added here:
  // - quotePosition
  // - openPosition
  // - addLiquidity
  // - removeLiquidity
  // - closePosition
  // - collectFees
};

export default pancakeswapSolClmmRoutes;

import { FastifyPluginAsync } from 'fastify';

import poolInfoRoute from './poolInfo';
import positionInfoRoute from './positionInfo';

export const pancakeswapSolClmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(poolInfoRoute);
  await fastify.register(positionInfoRoute);
  // Additional routes will be added here:
  // - quotePosition
  // - openPosition
  // - addLiquidity
  // - removeLiquidity
  // - closePosition
  // - collectFees
  // - quoteSwap
  // - executeSwap
};

export default pancakeswapSolClmmRoutes;

import { FastifyPluginAsync } from 'fastify';

import addLiquidityRoute from './addLiquidity';
import executeSwapRoute from './executeSwap';
import poolInfoRoute from './poolInfo';
import positionInfoRoute from './positionInfo';
import quoteLiquidityRoute from './quoteLiquidity';
import quoteSwapRoute from './quoteSwap';
import removeLiquidityRoute from './removeLiquidity';

export const uniswapAmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(poolInfoRoute);
  await fastify.register(positionInfoRoute);
  await fastify.register(quoteSwapRoute);
  await fastify.register(quoteLiquidityRoute);
  await fastify.register(executeSwapRoute);
  await fastify.register(addLiquidityRoute);
  await fastify.register(removeLiquidityRoute);
};

export default uniswapAmmRoutes;

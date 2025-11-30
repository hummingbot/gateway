import { FastifyPluginAsync } from 'fastify';

import { addLiquidityRoute } from './addLiquidity';
import { executeSwapRoute } from './executeSwap';
import { poolInfoRoute } from './poolInfo';
import { positionInfoRoute } from './positionInfo';
import { positionsOwnedRoute } from './positionsOwned';
import { quoteSwapRoute } from './quoteSwap';
import { removeLiquidityRoute } from './removeLiquidity';

export const osmosisAmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(poolInfoRoute);
  await fastify.register(positionInfoRoute);
  await fastify.register(quoteSwapRoute);
  await fastify.register(positionsOwnedRoute);
  await fastify.register(executeSwapRoute);
  await fastify.register(addLiquidityRoute);
  await fastify.register(removeLiquidityRoute);
};

export default osmosisAmmRoutes;

import { FastifyPluginAsync } from 'fastify';

import { addLiquidityRoute } from './addLiquidity';
import { closePositionRoute } from './closePosition';
import { collectFeesRoute } from './collectFees';
import { executeSwapRoute } from './executeSwap';
import { fetchPoolsRoute } from './fetchPools';
import { openPositionRoute } from './openPosition';
import { poolInfoRoute } from './poolInfo';
import { positionInfoRoute } from './positionInfo';
import { positionsOwnedRoute } from './positionsOwned';
import { quotePositionRoute } from './quotePosition';
import { quoteSwapRoute } from './quoteSwap';
import { removeLiquidityRoute } from './removeLiquidity';

export const orcaClmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fetchPoolsRoute);
  await fastify.register(poolInfoRoute);
  await fastify.register(positionsOwnedRoute);
  await fastify.register(positionInfoRoute);
  await fastify.register(quotePositionRoute);
  await fastify.register(quoteSwapRoute);
  await fastify.register(executeSwapRoute);
  await fastify.register(openPositionRoute);
  await fastify.register(addLiquidityRoute);
  await fastify.register(removeLiquidityRoute);
  await fastify.register(collectFeesRoute);
  await fastify.register(closePositionRoute);
};

export default orcaClmmRoutes;

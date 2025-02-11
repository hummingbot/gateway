import type { FastifyPluginAsync } from 'fastify';
import sensible from '@fastify/sensible';

import { poolInfoRoute } from './routes/poolInfo';
import { positionsOwnedRoute } from './routes/positionsOwned';
import { positionInfoRoute } from './routes/positionInfo';
import { quoteSwapRoute } from './routes/quoteSwap';
import { quotePositionRoute } from './routes/quotePosition';
import { executeSwapRoute } from './routes/executeSwap';
import { openPositionRoute } from './routes/openPosition';
import { addLiquidityRoute } from './routes/addLiquidity';
import { removeLiquidityRoute } from './routes/removeLiquidity';
import { collectFeesRoute } from './routes/collectFees';
import { closePositionRoute } from './routes/closePosition';

export const raydiumClmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(poolInfoRoute);
  await fastify.register(positionsOwnedRoute);
  await fastify.register(positionInfoRoute); 
  await fastify.register(quoteSwapRoute);
  await fastify.register(quotePositionRoute);
  await fastify.register(executeSwapRoute);
  await fastify.register(openPositionRoute);
  await fastify.register(addLiquidityRoute);
  await fastify.register(removeLiquidityRoute);
  await fastify.register(collectFeesRoute);
  await fastify.register(closePositionRoute);
};

export default raydiumClmmRoutes;
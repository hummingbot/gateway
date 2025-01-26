import type { FastifyPluginAsync } from 'fastify';
import sensible from '@fastify/sensible';

import { positionsOwnedRoute } from './routes/positionsOwned';
import { activeBinRoute } from './routes/activeBin';
import { quoteSwapRoute } from './routes/quoteSwap';
import { poolsRoute } from './routes/pools';
import { quoteFeesRoute } from './routes/quoteFees';
import { executeSwapRoute } from './routes/executeSwap';
import { openPositionRoute } from './routes/openPosition';
import { addLiquidityRoute } from './routes/addLiquidity';
import { removeLiquidityRoute } from './routes/removeLiquidity';
import { collectFeesRoute } from './routes/collectFees';
import { closePositionRoute } from './routes/closePosition';

export const meteoraRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);
  
  await fastify.register(positionsOwnedRoute);
  await fastify.register(activeBinRoute);
  await fastify.register(quoteSwapRoute);
  await fastify.register(poolsRoute);
  await fastify.register(quoteFeesRoute);
  await fastify.register(executeSwapRoute);
  await fastify.register(openPositionRoute);
  await fastify.register(addLiquidityRoute);
  await fastify.register(removeLiquidityRoute);
  await fastify.register(collectFeesRoute);
  await fastify.register(closePositionRoute);
};

export default meteoraRoutes; 
import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

import { addLiquidityRoute } from './clmm-routes/addLiquidity';
import { closePositionRoute } from './clmm-routes/closePosition';
import { collectFeesRoute } from './clmm-routes/collectFees';
import { executeSwapRoute } from './clmm-routes/executeSwap';
import { fetchPoolsRoute } from './clmm-routes/fetchPools';
import { openPositionRoute } from './clmm-routes/openPosition';
import { poolInfoRoute } from './clmm-routes/poolInfo';
import { positionInfoRoute } from './clmm-routes/positionInfo';
import { positionsOwnedRoute } from './clmm-routes/positionsOwned';
import { quoteSwapRoute } from './clmm-routes/quoteSwap';
import { removeLiquidityRoute } from './clmm-routes/removeLiquidity';

// CLMM routes including swap endpoints
const meteoraClmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['meteora'];
      }
    });

    await instance.register(fetchPoolsRoute);
    await instance.register(poolInfoRoute);
    await instance.register(positionsOwnedRoute);
    await instance.register(positionInfoRoute);
    await instance.register(quoteSwapRoute);
    await instance.register(executeSwapRoute);
    await instance.register(openPositionRoute);
    await instance.register(addLiquidityRoute);
    await instance.register(removeLiquidityRoute);
    await instance.register(collectFeesRoute);
    await instance.register(closePositionRoute);
  });
};

// Export the CLMM routes
export const meteoraRoutes = {
  clmm: meteoraClmmRoutes,
};

export default meteoraRoutes;

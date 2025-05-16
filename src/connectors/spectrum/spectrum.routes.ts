import { FastifyPluginAsync } from 'fastify';

import sensible from '@fastify/sensible';
import addLiquidityRoute from './amm-routes/addLiquidity';
import executeSwapRoute from './amm-routes/executeSwap';
import poolInfoRoute from './amm-routes/poolInfo';
import positionInfoRoute from './amm-routes/positionInfo';
import quoteLiquidityRoute from './amm-routes/quoteLiquidity';
import quoteSwapRoute from './amm-routes/quoteSwap';
import removeLiquidityRoute from './amm-routes/removeLiquidity';

// AMM routes including swap endpoints
const spectrumAmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['spectrum/amm'];
      }
    });

    await instance.register(addLiquidityRoute);
    await instance.register(executeSwapRoute);
    await instance.register(poolInfoRoute);
    await instance.register(positionInfoRoute);
    await instance.register(quoteLiquidityRoute);
    await instance.register(quoteSwapRoute);
    await instance.register(removeLiquidityRoute);
  });
};

// Main export that combines all routes
export const spectrumRoutes = {
  amm: spectrumAmmRoutes,
};

import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';
import { ammPoolInfoRoute } from './amm-routes/poolInfo';
import { quoteSwapRoute as ammQuoteSwapRoute } from './amm-routes/quoteSwap';

// AMM routes including swap endpoints
const minswapAmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['minswap/amm'];
      }
    });

    await instance.register(ammPoolInfoRoute);
    await instance.register(ammQuoteSwapRoute);
    // await instance.register(quoteLiquidityRoute);
    // await instance.register(ammExecuteSwapRoute);
    // await instance.register(ammAddLiquidityRoute);
    // await instance.register(ammRemoveLiquidityRoute);
  });
};

// Main export that combines all routes
export const minswapRoutes = {
  amm: minswapAmmRoutes,
};

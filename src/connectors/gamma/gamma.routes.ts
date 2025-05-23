import type { FastifyPluginAsync } from 'fastify';
import sensible from '@fastify/sensible';

// AMM routes
import { poolInfoRoute as ammPoolInfoRoute } from './amm-routes/poolInfo';
import { quoteLiquidityRoute } from './amm-routes/quoteLiquidity';
import { quoteSwapRoute as ammQuoteSwapRoute } from './amm-routes/quoteSwap';
import { executeSwapRoute as ammExecuteSwapRoute } from './amm-routes/executeSwap';
import { addLiquidityRoute as ammAddLiquidityRoute } from './amm-routes/addLiquidity';
import { removeLiquidityRoute as ammRemoveLiquidityRoute } from './amm-routes/removeLiquidity';

// AMM routes including swap endpoints
const gammaAmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);
  
  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['gamma/amm'];
      }
    });
    
    await instance.register(ammPoolInfoRoute);
    await instance.register(quoteLiquidityRoute);
    await instance.register(ammQuoteSwapRoute);
    await instance.register(ammExecuteSwapRoute);
    await instance.register(ammAddLiquidityRoute);
    await instance.register(ammRemoveLiquidityRoute);
  });
};

// Main export that combines all routes
export const gammaRoutes = {
  amm: gammaAmmRoutes
};
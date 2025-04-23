import type { FastifyPluginAsync } from 'fastify';
import sensible from '@fastify/sensible';

// CLMM routes
import { poolInfoRoute as clmmPoolInfoRoute } from './clmm-routes/poolInfo';
import { positionsOwnedRoute } from './clmm-routes/positionsOwned';
import { positionInfoRoute } from './clmm-routes/positionInfo';
import { quoteSwapRoute } from './clmm-routes/quoteSwap';
import { quotePositionRoute } from './clmm-routes/quotePosition';
import { executeSwapRoute } from './clmm-routes/executeSwap';
import { openPositionRoute } from './clmm-routes/openPosition';
import { addLiquidityRoute } from './clmm-routes/addLiquidity';
import { removeLiquidityRoute } from './clmm-routes/removeLiquidity';
import { collectFeesRoute } from './clmm-routes/collectFees';
import { closePositionRoute } from './clmm-routes/closePosition';

// AMM routes
import { poolInfoRoute as ammPoolInfoRoute } from './amm-routes/poolInfo';
import { positionInfoRoute as ammPositionInfoRoute } from './amm-routes/positionInfo';
import { listPoolsRoute } from './amm-routes/listPools';
import { quoteLiquidityRoute } from './amm-routes/quoteLiquidity';
import { quoteSwapRoute as ammQuoteSwapRoute } from './amm-routes/quoteSwap';
import { executeSwapRoute as ammExecuteSwapRoute } from './amm-routes/executeSwap';
import { addLiquidityRoute as ammAddLiquidityRoute } from './amm-routes/addLiquidity';
import { removeLiquidityRoute as ammRemoveLiquidityRoute } from './amm-routes/removeLiquidity';

// CLMM routes including swap endpoints
const raydiumClmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);
  
  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['raydium/clmm'];
      }
    });
    
    await instance.register(clmmPoolInfoRoute);
    await instance.register(positionsOwnedRoute);
    await instance.register(positionInfoRoute);
    await instance.register(quotePositionRoute);
    await instance.register(quoteSwapRoute);
    await instance.register(executeSwapRoute);
    await instance.register(openPositionRoute);
    await instance.register(addLiquidityRoute);
    await instance.register(removeLiquidityRoute);
    await instance.register(collectFeesRoute);
    await instance.register(closePositionRoute);
  });
};

// AMM routes including swap endpoints
const raydiumAmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);
  
  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['raydium/amm'];
      }
    });
    
    await instance.register(ammPoolInfoRoute);
    await instance.register(ammPositionInfoRoute);
    await instance.register(listPoolsRoute);
    await instance.register(quoteLiquidityRoute);
    await instance.register(ammQuoteSwapRoute);
    await instance.register(ammExecuteSwapRoute);
    await instance.register(ammAddLiquidityRoute);
    await instance.register(ammRemoveLiquidityRoute);
  });
};

// Main export that combines all routes
export const raydiumRoutes = {
  clmm: raydiumClmmRoutes,
  amm: raydiumAmmRoutes
};
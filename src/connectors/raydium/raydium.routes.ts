import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

// CLMM routes
import { addLiquidityRoute as ammAddLiquidityRoute } from './amm-routes/addLiquidity';
import { executeSwapRoute as ammExecuteSwapRoute } from './amm-routes/executeSwap';
import { poolInfoRoute as ammPoolInfoRoute } from './amm-routes/poolInfo';
import { positionInfoRoute as ammPositionInfoRoute } from './amm-routes/positionInfo';
import { quoteLiquidityRoute } from './amm-routes/quoteLiquidity';
import { quoteSwapRoute as ammQuoteSwapRoute } from './amm-routes/quoteSwap';
import { removeLiquidityRoute as ammRemoveLiquidityRoute } from './amm-routes/removeLiquidity';
import { addLiquidityRoute } from './clmm-routes/addLiquidity';
import { closePositionRoute } from './clmm-routes/closePosition';
import { collectFeesRoute } from './clmm-routes/collectFees';
import { executeSwapRoute } from './clmm-routes/executeSwap';
import { openPositionRoute } from './clmm-routes/openPosition';
import { poolInfoRoute as clmmPoolInfoRoute } from './clmm-routes/poolInfo';
import { positionInfoRoute } from './clmm-routes/positionInfo';
import { positionsOwnedRoute } from './clmm-routes/positionsOwned';
import { quotePositionRoute } from './clmm-routes/quotePosition';
import { quoteSwapRoute } from './clmm-routes/quoteSwap';
import { removeLiquidityRoute } from './clmm-routes/removeLiquidity';

// AMM routes

// CLMM routes including swap endpoints
const raydiumClmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['raydium'];
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
        routeOptions.schema.tags = ['raydium'];
      }
    });

    await instance.register(ammPoolInfoRoute);
    await instance.register(ammPositionInfoRoute);
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
  amm: raydiumAmmRoutes,
};

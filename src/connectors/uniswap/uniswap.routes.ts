import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

// Import swap routes

// Import AMM routes
import addLiquidityRoute from './amm-routes/addLiquidity';
import ammExecuteSwapRoute from './amm-routes/executeSwap';
import poolInfoRoute from './amm-routes/poolInfo';
import positionInfoRoute from './amm-routes/positionInfo';
import quoteLiquidityRoute from './amm-routes/quoteLiquidity';
import ammQuoteSwapRoute from './amm-routes/quoteSwap';
import removeLiquidityRoute from './amm-routes/removeLiquidity';

// Import CLMM routes
import clmmAddLiquidityRoute from './clmm-routes/addLiquidity';
import closePositionRoute from './clmm-routes/closePosition';
import collectFeesRoute from './clmm-routes/collectFees';
import clmmExecuteSwapRoute from './clmm-routes/executeSwap';
import openPositionRoute from './clmm-routes/openPosition';
import clmmPoolInfoRoute from './clmm-routes/poolInfo';
import clmmPositionInfoRoute from './clmm-routes/positionInfo';
import positionsOwnedRoute from './clmm-routes/positionsOwned';
import quotePositionRoute from './clmm-routes/quotePosition';
import clmmQuoteSwapRoute from './clmm-routes/quoteSwap';
import clmmRemoveLiquidityRoute from './clmm-routes/removeLiquidity';
import { uniswapSwapV2Routes } from './swap-routes-v2';

// Swap routes (Universal Router with 4 endpoints)
const uniswapSwapRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/uniswap'];
      }
    });

    await instance.register(uniswapSwapV2Routes);
  });
};

// AMM routes (Uniswap V2)
const uniswapAmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/uniswap'];
      }
    });

    await instance.register(poolInfoRoute);
    await instance.register(positionInfoRoute);
    await instance.register(ammQuoteSwapRoute);
    await instance.register(quoteLiquidityRoute);
    await instance.register(ammExecuteSwapRoute);
    await instance.register(addLiquidityRoute);
    await instance.register(removeLiquidityRoute);
  });
};

// CLMM routes (Uniswap V3)
const uniswapClmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/uniswap'];
      }
    });

    await instance.register(clmmPoolInfoRoute);
    await instance.register(clmmPositionInfoRoute);
    await instance.register(positionsOwnedRoute);
    await instance.register(quotePositionRoute);
    await instance.register(clmmQuoteSwapRoute);
    await instance.register(clmmExecuteSwapRoute);
    await instance.register(openPositionRoute);
    await instance.register(clmmAddLiquidityRoute);
    await instance.register(clmmRemoveLiquidityRoute);
    await instance.register(collectFeesRoute);
    await instance.register(closePositionRoute);
  });
};

// Export routes in the same pattern as other connectors
export const uniswapRoutes = {
  swap: uniswapSwapRoutes,
  amm: uniswapAmmRoutes,
  clmm: uniswapClmmRoutes,
};

export default uniswapRoutes;

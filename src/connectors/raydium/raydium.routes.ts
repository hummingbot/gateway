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
import { quoteLiquidityRoute } from './amm-routes/quoteLiquidity';
import { addLiquidityRoute as ammAddLiquidityRoute } from './amm-routes/addLiquidity';

const raydiumClmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);
  
  await fastify.register(clmmPoolInfoRoute);
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

const raydiumAmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible); 
  await fastify.register(ammPoolInfoRoute);
  await fastify.register(quoteLiquidityRoute);
  await fastify.register(ammAddLiquidityRoute);
};

// Main export that combines both
export const raydiumRoutes = {
  clmm: raydiumClmmRoutes,
  amm: raydiumAmmRoutes
};
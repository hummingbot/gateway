import { FastifyPluginAsync } from 'fastify';
import { logger } from '../../services/logger';

// Import AMM routes
import poolInfoRoute from './amm-routes/poolInfo';
import ammQuoteSwapRoute from './amm-routes/quoteSwap';
import ammExecuteSwapRoute from './amm-routes/executeSwap';
import addLiquidityRoute from './amm-routes/addLiquidity';
import removeLiquidityRoute from './amm-routes/removeLiquidity';
import positionInfoRoute from './amm-routes/positionInfo';
import quoteLiquidityRoute from './amm-routes/quoteLiquidity';

// Import new router-based routes
import quoteSwapRoute from './routes/quote-swap';
import executeSwapRoute from './routes/execute-swap';

export const uniswapRoutes: FastifyPluginAsync = async (fastify) => {
  // Register direct routes (using SwapRouter02)
  fastify.register(quoteSwapRoute);
  fastify.register(executeSwapRoute);

  // Register AMM routes (Uniswap V2)
  fastify.register(
    async (ammRouter) => {
      await ammRouter.register(poolInfoRoute);
      await ammRouter.register(ammQuoteSwapRoute);
      await ammRouter.register(ammExecuteSwapRoute);
      await ammRouter.register(addLiquidityRoute);
      await ammRouter.register(removeLiquidityRoute);
      await ammRouter.register(positionInfoRoute);
      await ammRouter.register(quoteLiquidityRoute);
    },
    { prefix: '/amm' }
  );

  // Register CLMM routes (Uniswap V3)
  fastify.register(
    async (clmmRouter) => {
      await clmmRouter.register(require('./clmm-routes/poolInfo').default);
      await clmmRouter.register(require('./clmm-routes/quoteSwap').default);
      await clmmRouter.register(require('./clmm-routes/executeSwap').default);
      await clmmRouter.register(require('./clmm-routes/positionInfo').default);
      await clmmRouter.register(require('./clmm-routes/positionsOwned').default);
      await clmmRouter.register(require('./clmm-routes/openPosition').default);
      await clmmRouter.register(require('./clmm-routes/addLiquidity').default);
      await clmmRouter.register(require('./clmm-routes/removeLiquidity').default);
      await clmmRouter.register(require('./clmm-routes/collectFees').default);
      await clmmRouter.register(require('./clmm-routes/closePosition').default);
      await clmmRouter.register(require('./clmm-routes/quotePosition').default);
    },
    { prefix: '/clmm' }
  );
};

export default uniswapRoutes;
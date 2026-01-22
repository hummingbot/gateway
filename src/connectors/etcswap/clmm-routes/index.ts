import { FastifyPluginAsync } from 'fastify';

import addLiquidityRoute from './addLiquidity';
import closePositionRoute from './closePosition';
import collectFeesRoute from './collectFees';
import executeSwapRoute from './executeSwap';
import openPositionRoute from './openPosition';
import poolInfoRoute from './poolInfo';
import positionInfoRoute from './positionInfo';
import positionsOwnedRoute from './positionsOwned';
import quotePositionRoute from './quotePosition';
import quoteSwapRoute from './quoteSwap';
import removeLiquidityRoute from './removeLiquidity';

/**
 * ETCswap CLMM (V3) routes
 *
 * Note: ETCswap V3 is only available on Ethereum Classic mainnet (classic).
 * On Mordor testnet, V3 is not deployed.
 *
 * Swap routes:
 * - pool-info: Get pool information
 * - quote-swap: Get swap quote
 * - execute-swap: Execute a swap
 *
 * Position management routes:
 * - position-info: Get position details by token ID
 * - positions-owned: List all positions owned by a wallet
 * - quote-position: Quote token amounts for a new position
 * - open-position: Open a new liquidity position
 * - add-liquidity: Add liquidity to an existing position
 * - remove-liquidity: Remove liquidity from a position
 * - collect-fees: Collect accumulated fees from a position
 * - close-position: Close a position (remove all liquidity and burn NFT)
 */
export const etcswapClmmRoutes: FastifyPluginAsync = async (fastify) => {
  // Swap routes
  await fastify.register(poolInfoRoute);
  await fastify.register(quoteSwapRoute);
  await fastify.register(executeSwapRoute);

  // Position management routes
  await fastify.register(positionInfoRoute);
  await fastify.register(positionsOwnedRoute);
  await fastify.register(quotePositionRoute);
  await fastify.register(openPositionRoute);
  await fastify.register(addLiquidityRoute);
  await fastify.register(removeLiquidityRoute);
  await fastify.register(collectFeesRoute);
  await fastify.register(closePositionRoute);
};

export default etcswapClmmRoutes;

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import path from 'path';
import addLiquidityRoute from './routes/addLiquidity';
import closePositionRoute from './routes/closePosition';
import collectFeesRoute from './routes/collectFees';
import executeSwapRoute from './routes/executeSwap';
import getFeesQuoteRoute from './routes/getFeesQuote';
import getLbPairsRoute from './routes/getLbPairs';
import getSwapQuoteRoute from './routes/getSwapQuote';
import openPositionRoute from './routes/openPosition';
import removeLiquidityRoute from './routes/removeLiquidity';
import getPositionsOwnedByRoute from './routes/getPositionsOwnedBy';
import getActiveBinRoute from './routes/getActiveBin';

export const meteoraRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Get the folder name dynamically
  const folderName = path.basename(__dirname);

  // Register individual routes
  addLiquidityRoute(fastify, folderName);
  closePositionRoute(fastify, folderName);
  collectFeesRoute(fastify, folderName);
  executeSwapRoute(fastify, folderName);
  getFeesQuoteRoute(fastify, folderName);
  getLbPairsRoute(fastify, folderName);
  getSwapQuoteRoute(fastify, folderName);
  openPositionRoute(fastify, folderName);
  removeLiquidityRoute(fastify, folderName);
  getPositionsOwnedByRoute(fastify, folderName);
  getActiveBinRoute(fastify, folderName);
};

export default meteoraRoutes;

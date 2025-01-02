import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import path from 'path';
import getSwapQuoteRoute from './routes/quoteSwap';
import executeSwapRoute from './routes/executeSwap';

export const jupiterRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Get the folder name dynamically
  const folderName = path.basename(__dirname);

  // Register individual routes
  getSwapQuoteRoute(fastify, folderName);
  executeSwapRoute(fastify, folderName);

};

export default jupiterRoutes;
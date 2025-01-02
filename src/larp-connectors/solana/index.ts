import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import path from 'path';
import getBalanceRoute from './routes/getBalance';
import getTokenListRoute from './routes/listTokens';
import getAddressInfoRoute from './routes/getAddressInfo';
import getSymbolInfoRoute from './routes/getSymbolInfo';
import getNetworkFeesRoute from './routes/getPriorityFees';

export const solanaRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Get the folder name dynamically
  const folderName = path.basename(__dirname);

  // Register individual routes
  getBalanceRoute(fastify, folderName);
  getTokenListRoute(fastify, folderName);
  getAddressInfoRoute(fastify, folderName);
  getSymbolInfoRoute(fastify, folderName);
  getNetworkFeesRoute(fastify, folderName);
}

export default solanaRoutes;
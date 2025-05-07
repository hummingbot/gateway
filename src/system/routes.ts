import { FastifyPluginAsync } from 'fastify';
import { configRoutes } from './config/config.routes';
import { connectorsRoutes } from './connectors/connector.routes';
import { walletRoutes } from './wallet/wallet.routes';

export const systemRoutes: FastifyPluginAsync = async (fastify) => {
  // Register config routes under /config
  fastify.register(configRoutes, { prefix: '/config' });
  
  // Register connector routes under /connectors
  fastify.register(connectorsRoutes, { prefix: '/connectors' });
  
  // Register wallet routes under /wallet
  fastify.register(walletRoutes, { prefix: '/wallet' });
};

export default systemRoutes;
import { FastifyInstance } from 'fastify';

import { ZeroXConfig } from './0x.config';
import zeroXRouterRoutes from './router-routes';

export const register0xRoutes = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // Get available networks from config
  const networks = ZeroXConfig.networks.mainnet.availableNetworks;

  // Validate that we have at least one network configured
  if (networks.length === 0) {
    throw new Error('No networks configured for 0x connector');
  }

  // Register v2 router routes (4 endpoints)
  await fastify.register(zeroXRouterRoutes, {
    prefix: '/connectors/0x/router',
  });
};

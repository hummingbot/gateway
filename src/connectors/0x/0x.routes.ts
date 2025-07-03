import { FastifyInstance } from 'fastify';

import { ZeroXConfig } from './0x.config';
import executeSwapRoute from './swap-routes/executeSwap';
import quoteSwapRoute from './swap-routes/quoteSwap';

export const register0xRoutes = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // Get available networks from config
  const networks = ZeroXConfig.networks.mainnet.availableNetworks;

  // Validate that we have at least one network configured
  if (networks.length === 0) {
    throw new Error('No networks configured for 0x connector');
  }

  // Register swap routes
  await fastify.register(quoteSwapRoute, {
    prefix: '/connectors/0x/swap',
  });

  await fastify.register(executeSwapRoute, {
    prefix: '/connectors/0x/swap',
  });
};

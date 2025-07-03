import { FastifyInstance } from 'fastify';

import { ZeroXConfig } from './0x.config';
import zeroXSwapV2Routes from './swap-routes-v2';

export const register0xRoutes = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // Get available networks from config
  const networks = ZeroXConfig.networks.mainnet.availableNetworks;

  // Validate that we have at least one network configured
  if (networks.length === 0) {
    throw new Error('No networks configured for 0x connector');
  }

  // Register v2 swap routes (4 endpoints)
  await fastify.register(zeroXSwapV2Routes, {
    prefix: '/connectors/0x/swap',
  });
};

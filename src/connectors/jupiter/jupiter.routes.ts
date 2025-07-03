import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

// Import routes
import { jupiterSwapV2Routes } from './swap-routes-v2';

// Jupiter routes with 4 endpoints
const jupiterSwapRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    // Decorate the instance with a hook to modify route options
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/jupiter'];
      }
    });

    await instance.register(jupiterSwapV2Routes);
  });
};

// Export routes in the same pattern as Raydium
export const jupiterRoutes = {
  swap: jupiterSwapRoutesWrapper,
};

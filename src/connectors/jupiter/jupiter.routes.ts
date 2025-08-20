import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

// Import routes
import { jupiterRouterRoutes } from './router-routes';

// Jupiter routes with 4 endpoints
const jupiterRouterRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    // Decorate the instance with a hook to modify route options
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/jupiter'];
      }
    });

    await instance.register(jupiterRouterRoutes);
  });
};

// Export routes in the same pattern as Raydium
export const jupiterRoutes = {
  router: jupiterRouterRoutesWrapper,
};

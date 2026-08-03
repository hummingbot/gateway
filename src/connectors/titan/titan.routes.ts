import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

// Import routes
import { titanRouterRoutes } from './router-routes';

// Titan routes with 3 endpoints
const titanRouterRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    // Decorate the instance with a hook to modify route options
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/titan'];
      }
    });

    await instance.register(titanRouterRoutes);
  });
};

// Export routes in the same pattern as Jupiter
export const titanRoutes = {
  router: titanRouterRoutesWrapper,
};

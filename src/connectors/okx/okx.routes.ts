import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

// Import routes
import { okxRouterRoutes } from './router-routes';

// OKX routes with 3 endpoints
const okxRouterRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    // Decorate the instance with a hook to modify route options
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/okx'];
      }
    });

    await instance.register(okxRouterRoutes);
  });
};

// Export routes in the same pattern as Jupiter
export const okxRoutes = {
  router: okxRouterRoutesWrapper,
};

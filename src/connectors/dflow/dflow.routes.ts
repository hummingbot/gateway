import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

// Import routes
import { dflowRouterRoutes } from './router-routes';

// DFlow routes with 3 endpoints
const dflowRouterRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    // Decorate the instance with a hook to modify route options
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/dflow'];
      }
    });

    await instance.register(dflowRouterRoutes);
  });
};

// Export routes in the same pattern as Jupiter
export const dflowRoutes = {
  router: dflowRouterRoutesWrapper,
};

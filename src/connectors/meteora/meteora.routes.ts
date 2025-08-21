import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

// Import routes
import { meteoraClmmRoutes } from './clmm-routes';

// CLMM routes including swap endpoints
const meteoraClmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/meteora'];
      }
    });

    await instance.register(meteoraClmmRoutes);
  });
};

// Export the CLMM routes
export const meteoraRoutes = {
  clmm: meteoraClmmRoutesWrapper,
};

export default meteoraRoutes;

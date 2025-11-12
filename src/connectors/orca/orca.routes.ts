import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

// Import routes
import { orcaClmmRoutes } from './clmm-routes';

// CLMM routes including swap endpoints
const orcaClmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/orca'];
      }
    });

    await instance.register(orcaClmmRoutes);
  });
};

// Export the CLMM routes
export const orcaRoutes = {
  clmm: orcaClmmRoutesWrapper,
};

export default orcaRoutes;

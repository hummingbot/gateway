import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

// Import routes
import { oreRoutes } from './ore-routes';

// ORE mining/staking routes wrapper
const oreRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/ore'];
      }
    });

    await instance.register(oreRoutes);
  });
};

// Export the ORE routes
export const oreConnectorRoutes = {
  ore: oreRoutesWrapper,
};

export default oreConnectorRoutes;

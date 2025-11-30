import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

// Import routes
import { osmosisAmmRoutes } from './amm-routes';
import { osmosisClmmRoutes } from './clmm-routes';
import { osmosisRouterRoutes } from './router-routes';

// Stableswap routes
const osmosisRouterRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/osmosis'];
      }
    });

    await instance.register(osmosisRouterRoutes);
  });
};

// AMM routes
const osmosisAmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/osmosis'];
      }
    });

    await instance.register(osmosisAmmRoutes);
  });
};

// CLMM routes
const osmosisClmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/osmosis'];
      }
    });

    await instance.register(osmosisClmmRoutes);
  });
};

// Export routes in the same pattern as other connectors
export const osmosisRoutes = {
  router: osmosisRouterRoutesWrapper,
  amm: osmosisAmmRoutesWrapper,
  clmm: osmosisClmmRoutesWrapper,
};

export default osmosisRoutes;

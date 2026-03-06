import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

// Import routes
import { etcswapAmmRoutes } from './amm-routes';
import { etcswapClmmRoutes } from './clmm-routes';
import { etcswapRouterRoutes } from './router-routes';

// AMM routes (ETCswap V2)
const etcswapAmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/etcswap'];
      }
    });

    await instance.register(etcswapAmmRoutes);
  });
};

// CLMM routes (ETCswap V3)
const etcswapClmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/etcswap'];
      }
    });

    await instance.register(etcswapClmmRoutes);
  });
};

// Router routes (ETCswap Universal Router)
const etcswapRouterRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/etcswap'];
      }
    });

    await instance.register(etcswapRouterRoutes);
  });
};

// Export routes in the same pattern as other connectors
export const etcswapRoutes = {
  amm: etcswapAmmRoutesWrapper,
  clmm: etcswapClmmRoutesWrapper,
  router: etcswapRouterRoutesWrapper,
};

export default etcswapRoutes;

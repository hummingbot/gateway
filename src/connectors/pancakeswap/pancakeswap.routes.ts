import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

// Import routes
import { pancakeswapAmmRoutes } from './amm-routes';
import { pancakeswapClmmRoutes } from './clmm-routes';
import { pancakeswapRouterRoutes } from './router-routes';

// Router routes (Universal Router with 4 endpoints)
const pancakeswapRouterRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/pancakeswap'];
      }
    });

    await instance.register(pancakeswapRouterRoutes);
  });
};

// AMM routes (Pancakeswap V2)
const pancakeswapAmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/pancakeswap'];
      }
    });

    await instance.register(pancakeswapAmmRoutes);
  });
};

// CLMM routes (Pancakeswap V3)
const pancakeswapClmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/pancakeswap'];
      }
    });

    await instance.register(pancakeswapClmmRoutes);
  });
};

// Export routes in the same pattern as other connectors
export const pancakeswapRoutes = {
  router: pancakeswapRouterRoutesWrapper,
  amm: pancakeswapAmmRoutesWrapper,
  clmm: pancakeswapClmmRoutesWrapper,
};

export default pancakeswapRoutes;

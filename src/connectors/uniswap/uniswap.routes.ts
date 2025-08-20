import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

// Import routes
import { uniswapAmmRoutes } from './amm-routes';
import { uniswapClmmRoutes } from './clmm-routes';
import { uniswapRouterRoutes } from './router-routes';

// Router routes (Universal Router with 4 endpoints)
const uniswapRouterRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/uniswap'];
      }
    });

    await instance.register(uniswapRouterRoutes);
  });
};

// AMM routes (Uniswap V2)
const uniswapAmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/uniswap'];
      }
    });

    await instance.register(uniswapAmmRoutes);
  });
};

// CLMM routes (Uniswap V3)
const uniswapClmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/uniswap'];
      }
    });

    await instance.register(uniswapClmmRoutes);
  });
};

// Export routes in the same pattern as other connectors
export const uniswapRoutes = {
  router: uniswapRouterRoutesWrapper,
  amm: uniswapAmmRoutesWrapper,
  clmm: uniswapClmmRoutesWrapper,
};

export default uniswapRoutes;

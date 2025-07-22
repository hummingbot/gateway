import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

// Import routes
import { etcSwapAmmRoutes } from './amm-routes';
import { etcSwapClmmRoutes } from './clmm-routes';
import { etcSwapRouterRoutes } from './router-routes';

// Router routes (Universal Router with 4 endpoints)
const etcSwapRouterRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/etcSwap'];
      }
    });

    await instance.register(etcSwapRouterRoutes);
  });
};

// AMM routes (ETCSwap V2)
const etcSwapAmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/etcSwap'];
      }
    });

    await instance.register(etcSwapAmmRoutes);
  });
};

// CLMM routes (ETCSwap V3)
const etcSwapClmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/etcSwap'];
      }
    });

    await instance.register(etcSwapClmmRoutes);
  });
};

// Export routes in the same pattern as other connectors
export const etcSwapRoutes = {
  router: etcSwapRouterRoutesWrapper,
  amm: etcSwapAmmRoutesWrapper,
  clmm: etcSwapClmmRoutesWrapper,
};

export default etcSwapRoutes;

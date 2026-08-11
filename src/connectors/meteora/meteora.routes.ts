import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

// Import routes
import { meteoraAmmRoutes } from './amm-routes';
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

// AMM routes (DAMM v2 / cp-amm), including swap endpoints
const meteoraAmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/meteora'];
      }
    });

    await instance.register(meteoraAmmRoutes);
  });
};

// Export the CLMM and AMM routes
export const meteoraRoutes = {
  clmm: meteoraClmmRoutesWrapper,
  amm: meteoraAmmRoutesWrapper,
};

export default meteoraRoutes;

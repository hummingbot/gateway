import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

// Import routes
import { raydiumAmmRoutes } from './amm-routes';
import { raydiumClmmRoutes } from './clmm-routes';

// CLMM routes including swap endpoints
const raydiumClmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/raydium'];
      }
    });

    await instance.register(raydiumClmmRoutes);
  });
};

// AMM routes including swap endpoints
const raydiumAmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/raydium'];
      }
    });

    await instance.register(raydiumAmmRoutes);
  });
};

// Main export that combines all routes
export const raydiumRoutes = {
  clmm: raydiumClmmRoutesWrapper,
  amm: raydiumAmmRoutesWrapper,
};

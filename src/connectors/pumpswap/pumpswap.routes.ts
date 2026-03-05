import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

// Import routes
import { pumpswapAmmRoutes } from './amm-routes';

// AMM routes including swap endpoints
const pumpswapAmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/pumpswap'];
      }
    });

    await instance.register(pumpswapAmmRoutes);
  });
};

// Main export that combines all routes
export const pumpswapRoutes = {
  amm: pumpswapAmmRoutesWrapper,
};

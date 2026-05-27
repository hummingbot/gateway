import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

import { metadaoFutarchyRoutes } from './futarchy-routes';

// Futarchy routes wrapper with Swagger tag
const metadaoFutarchyRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/metadao'];
      }
    });

    await instance.register(metadaoFutarchyRoutes);
  });
};

// Main export that combines all routes
export const metadaoRoutes = {
  futarchy: metadaoFutarchyRoutesWrapper,
};

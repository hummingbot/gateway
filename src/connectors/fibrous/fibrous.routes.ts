import { FastifyInstance } from 'fastify';

import fibrousRouterRoutes from './router-routes';

export const registerFibrousRoutes = async (fastify: FastifyInstance): Promise<void> => {
  // Register router routes (3 endpoints)
  await fastify.register(fibrousRouterRoutes, {
    prefix: '/connectors/fibrous/router',
  });
};

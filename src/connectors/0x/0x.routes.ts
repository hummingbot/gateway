import { FastifyInstance } from 'fastify';

import zeroXRouterRoutes from './router-routes';

export const register0xRoutes = async (fastify: FastifyInstance): Promise<void> => {
  // Register v2 router routes (4 endpoints)
  await fastify.register(zeroXRouterRoutes, {
    prefix: '/connectors/0x/router',
  });
};

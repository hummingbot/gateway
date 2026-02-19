import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

import { balancesRoute } from './routes/balances';

export const bscRoutes: FastifyPluginAsync = async (fastify) => {
  // Register @fastify/sensible plugin to enable httpErrors
  await fastify.register(sensible);

  // Register BSC-specific route handlers
  fastify.register(balancesRoute);
};

export default bscRoutes;

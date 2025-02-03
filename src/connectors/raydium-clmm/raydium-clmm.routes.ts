import type { FastifyPluginAsync } from 'fastify';
import sensible from '@fastify/sensible';

import { poolInfoRoute } from './routes/poolInfo';
import { positionInfoRoute } from './routes/positionInfo';

export const raydiumClmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(poolInfoRoute);
  await fastify.register(positionInfoRoute);
};

export default raydiumClmmRoutes;
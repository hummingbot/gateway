import type { FastifyPluginAsync } from 'fastify';
import sensible from '@fastify/sensible';

import { poolInfoRoute } from './routes/poolInfo';
import { positionInfoRoute } from './routes/positionInfo';
import { closePositionRoute } from './routes/closePosition';

export const raydiumClmmRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(poolInfoRoute);
  await fastify.register(positionInfoRoute);
  await fastify.register(closePositionRoute);
};

export default raydiumClmmRoutes;
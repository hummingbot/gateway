import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

import { getConfigRoute } from './routes/getConfig';
import { updateConfigRoute } from './routes/updateConfig';

export const configRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  // Register individual route handlers
  await fastify.register(getConfigRoute);
  await fastify.register(updateConfigRoute);
};

export default configRoutes;

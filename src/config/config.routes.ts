import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

import { addPoolRoute } from './routes/addPool';
import { getConfigRoute } from './routes/getConfig';
import { getPoolsRoute } from './routes/getPools';
import { removePoolRoute } from './routes/removePool';
import { updateConfigRoute } from './routes/updateConfig';

export const configRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  // Register individual route handlers
  await fastify.register(getConfigRoute);
  await fastify.register(updateConfigRoute);
  await fastify.register(getPoolsRoute);
  await fastify.register(addPoolRoute);
  await fastify.register(removePoolRoute);
};

export default configRoutes;

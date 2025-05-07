import { FastifyPluginAsync } from 'fastify';
import { getConfigRoute } from './routes/getConfig';
import { updateConfigRoute } from './routes/updateConfig';
import { getPoolsRoute } from './routes/getPools';
import { addPoolRoute } from './routes/addPool';
import { removePoolRoute } from './routes/removePool';

export const configRoutes: FastifyPluginAsync = async (fastify) => {
  // Register individual route handlers
  await fastify.register(getConfigRoute);
  await fastify.register(updateConfigRoute);
  await fastify.register(getPoolsRoute);
  await fastify.register(addPoolRoute);
  await fastify.register(removePoolRoute);
};

export default configRoutes;
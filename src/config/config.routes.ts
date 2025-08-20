import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

import { getChainsRoute } from './routes/getChains';
import { getConfigRoute } from './routes/getConfig';
import { getConnectorsRoute } from './routes/getConnectors';
import { getNamespacesRoute } from './routes/getNamespaces';
import { updateConfigRoute } from './routes/updateConfig';

export const configRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  // Register individual route handlers
  await fastify.register(getConfigRoute);
  await fastify.register(updateConfigRoute);
  await fastify.register(getChainsRoute);
  await fastify.register(getConnectorsRoute);
  await fastify.register(getNamespacesRoute);
};

export default configRoutes;

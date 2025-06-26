import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

import { listTokensRoute } from './routes/listTokens';
import { getTokenRoute } from './routes/getToken';
import { addTokenRoute } from './routes/addToken';
import { removeTokenRoute } from './routes/removeToken';

export const tokensRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  // Register individual route handlers
  await fastify.register(listTokensRoute);
  await fastify.register(getTokenRoute);
  await fastify.register(addTokenRoute);
  await fastify.register(removeTokenRoute);
};

export default tokensRoutes;
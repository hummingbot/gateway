import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

import { addTokenRoute } from './routes/addToken';
import { getTokenRoute } from './routes/getToken';
import { listTokensRoute } from './routes/listTokens';
import { removeTokenRoute } from './routes/removeToken';
import { topPoolsRoute } from './routes/topPools';

export const tokensRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  // Register individual route handlers
  await fastify.register(listTokensRoute);
  await fastify.register(getTokenRoute);
  await fastify.register(topPoolsRoute);
  await fastify.register(addTokenRoute);
  await fastify.register(removeTokenRoute);
};

export default tokensRoutes;

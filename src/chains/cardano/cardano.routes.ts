import { FastifyPluginAsync } from 'fastify';

import { statusRoute } from './routes/status';
import { tokensRoute } from './routes/tokens';
import { balancesRoute } from './routes/balances';
import { pollRoute } from './routes/poll';

// Register the type declaration needed for Fastify schema tags
declare module 'fastify' {
  interface FastifySchema {
    tags?: readonly string[];
    description?: string;
  }
}

export const cardanoRoutes: FastifyPluginAsync = async (fastify) => {
  // Register all the route handlers
  fastify.register(statusRoute);
  fastify.register(tokensRoute);
  fastify.register(balancesRoute);
  fastify.register(pollRoute);
};

export default cardanoRoutes;

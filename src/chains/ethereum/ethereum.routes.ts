import { FastifyPluginAsync } from 'fastify';

import { allowancesRoute } from './routes/allowances';
import { approveRoute } from './routes/approve';
import { balancesRoute } from './routes/balances';
import { estimateGasRoute } from './routes/estimate-gas';
import { pollRoute } from './routes/poll';
import { statusRoute } from './routes/status';
import { wrapRoute } from './routes/wrap';

// Register the type declaration needed for Fastify schema tags
declare module 'fastify' {
  interface FastifySchema {
    tags?: readonly string[];
    description?: string;
  }
}

export const ethereumRoutes: FastifyPluginAsync = async (fastify) => {
  // Register all the route handlers
  fastify.register(statusRoute);
  fastify.register(balancesRoute);
  fastify.register(pollRoute);
  fastify.register(allowancesRoute);
  fastify.register(approveRoute);
  fastify.register(estimateGasRoute);
  fastify.register(wrapRoute);
};

export default ethereumRoutes;

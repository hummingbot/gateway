import { FastifyPluginAsync } from 'fastify';
import { statusRoute } from './routes/status';
import { tokensRoute } from './routes/tokens';
import { balancesRoute } from './routes/balances';
import { pollRoute } from './routes/poll';
import { allowancesRoute } from './routes/allowances';
import { approveRoute } from './routes/approve';
import { estimateGasRoute } from './routes/estimate-gas';

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
  fastify.register(tokensRoute);
  fastify.register(balancesRoute);
  fastify.register(pollRoute);
  fastify.register(allowancesRoute);
  fastify.register(approveRoute);
  fastify.register(estimateGasRoute);
};

export default ethereumRoutes;
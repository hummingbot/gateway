import { FastifyPluginAsync } from 'fastify';

import { balancesRoute } from './chain-routes/balances';
import { estimateGasRoute } from './chain-routes/estimateGas';
import { pollRoute } from './chain-routes/poll';
import { statusRoute } from './chain-routes/status';
import { tokensRoute } from './chain-routes/tokens';

// Register the type declaration needed for Fastify schema tags
declare module 'fastify' {
  interface FastifySchema {
    tags?: readonly string[];
    description?: string;
  }
}

export const osmosisChainRoutes: FastifyPluginAsync = async (fastify) => {
  // Register all the route handlers
  fastify.register(statusRoute);
  fastify.register(tokensRoute);
  fastify.register(balancesRoute);
  fastify.register(pollRoute);
  fastify.register(estimateGasRoute);
};

export default osmosisChainRoutes;

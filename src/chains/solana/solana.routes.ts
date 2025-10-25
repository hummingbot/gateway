import { FastifyPluginAsync } from 'fastify';

import { balancesRoute } from './routes/balances';
import { estimateGasRoute } from './routes/estimate-gas';
import { executeSwapRoute } from './routes/execute-swap';
import { pollRoute } from './routes/poll';
import { quoteSwapRoute } from './routes/quote-swap';
import { statusRoute } from './routes/status';

export const solanaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(statusRoute);
  fastify.register(estimateGasRoute);
  fastify.register(balancesRoute);
  fastify.register(pollRoute);
  fastify.register(quoteSwapRoute);
  fastify.register(executeSwapRoute);
};

export default solanaRoutes;

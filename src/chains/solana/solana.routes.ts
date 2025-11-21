import { FastifyPluginAsync } from 'fastify';

import { balancesRoute } from './routes/balances';
import { estimateGasRoute } from './routes/estimate-gas';
import { parseRoute } from './routes/parse';
import { pollRoute } from './routes/poll';
import { statusRoute } from './routes/status';
import { transactionsRoute } from './routes/transactions';
import { unwrapRoute } from './routes/unwrap';
import { wrapRoute } from './routes/wrap';

export const solanaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(statusRoute);
  fastify.register(estimateGasRoute);
  fastify.register(balancesRoute);
  fastify.register(pollRoute);
  fastify.register(transactionsRoute);
  fastify.register(parseRoute);
  fastify.register(wrapRoute);
  fastify.register(unwrapRoute);
};

export default solanaRoutes;

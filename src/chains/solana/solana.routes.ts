import { FastifyPluginAsync } from 'fastify';

import { balancesRoute } from './routes/balances';
import { estimateGasRoute } from './routes/estimate-gas';
import { executeTxRoute } from './routes/execute-tx';
import { pollRoute } from './routes/poll';
import { statusRoute } from './routes/status';
import { unwrapRoute } from './routes/unwrap';
import { wrapRoute } from './routes/wrap';

export const solanaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(statusRoute);
  fastify.register(estimateGasRoute);
  fastify.register(balancesRoute);
  fastify.register(pollRoute);
  fastify.register(wrapRoute);
  fastify.register(unwrapRoute);
  fastify.register(executeTxRoute);
};

export default solanaRoutes;

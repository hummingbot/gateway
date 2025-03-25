import { FastifyPluginAsync } from 'fastify';
import { estimateGasRoute } from './routes/estimate-gas';
import { balancesRoute } from './routes/balances';
import { tokensRoute } from './routes/tokens';
import { pollRoute } from './routes/poll';
import { statusRoute } from './routes/status';


export const solanaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(statusRoute);
  fastify.register(tokensRoute);
  fastify.register(balancesRoute);
  fastify.register(pollRoute);
  fastify.register(estimateGasRoute);
};

export default solanaRoutes;

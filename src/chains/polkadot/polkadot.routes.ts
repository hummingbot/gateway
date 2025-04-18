import { FastifyPluginAsync } from 'fastify';
import { tokensRoute } from './routes/tokens';
import { statusRoute } from './routes/status';
import { balancesRoute } from './routes/balances';
import { pollRoute } from './routes/poll';
import { estimateGasRoute } from './routes/estimate-gas';

export const polkadotRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(statusRoute);
  fastify.register(tokensRoute);
  fastify.register(balancesRoute);
  fastify.register(pollRoute);
  fastify.register(estimateGasRoute);
};

export default polkadotRoutes;


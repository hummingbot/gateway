import { FastifyPluginAsync } from 'fastify';

import { balancesRoute } from './balances';
import { estimateGasRoute } from './estimateGas';
import { pollRoute } from './poll';
import { statusRoute } from './status';
import { tokensRoute } from './tokens';

export const osmosisChainRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(balancesRoute);
  await fastify.register(statusRoute);
  await fastify.register(estimateGasRoute);
  await fastify.register(pollRoute);
  await fastify.register(tokensRoute);
};

export default osmosisChainRoutes;

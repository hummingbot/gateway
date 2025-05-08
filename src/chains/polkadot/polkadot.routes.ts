import { FastifyPluginAsync } from 'fastify';
import { tokensRoute } from './routes/tokens';
import { statusRoute } from './routes/status';
import { balancesRoute } from './routes/balances';
import { pollRoute } from './routes/poll';
import { estimateGasRoute } from './routes/estimate-gas';

/**
 * Registers all Polkadot-related routes with the Fastify instance
 * 
 * This plugin registers the following endpoints:
 * - GET /status - Network status information
 * - GET /tokens - Token list retrieval
 * - POST /balances - Account balance lookup
 * - POST /poll - Transaction status polling
 * - POST /estimate-gas - Gas estimation for transactions
 */
export const polkadotRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(statusRoute);
  fastify.register(tokensRoute);
  fastify.register(balancesRoute);
  fastify.register(pollRoute);
  fastify.register(estimateGasRoute);
};

export default polkadotRoutes;


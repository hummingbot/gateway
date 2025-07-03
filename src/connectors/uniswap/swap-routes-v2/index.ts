import { FastifyPluginAsync } from 'fastify';

import executeQuoteRoute from './execute-quote';
import executeSwapRoute from './execute-swap';
import quoteSwapRoute from './quote-swap';

export const uniswapSwapV2Routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(quoteSwapRoute);
  await fastify.register(executeQuoteRoute);
  await fastify.register(executeSwapRoute);
};

export default uniswapSwapV2Routes;

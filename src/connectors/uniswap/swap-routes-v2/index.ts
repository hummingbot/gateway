import { FastifyPluginAsync } from 'fastify';

import executeQuoteRoute from './execute-quote';
import executeSwapRoute from './execute-swap';
import getPriceRoute from './get-price';
import getQuoteRoute from './get-quote';

export const uniswapSwapV2Routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(getPriceRoute);
  await fastify.register(getQuoteRoute);
  await fastify.register(executeQuoteRoute);
  await fastify.register(executeSwapRoute);
};

export default uniswapSwapV2Routes;

import { FastifyPluginAsync } from 'fastify';

import executeQuoteRoute from './executeQuote';
import executeSwapRoute from './executeSwap';
import getPriceRoute from './getPrice';
import quoteSwapRoute from './quoteSwap';

export const zeroXSwapV2Routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(getPriceRoute);
  await fastify.register(quoteSwapRoute);
  await fastify.register(executeQuoteRoute);
  await fastify.register(executeSwapRoute);
};

export default zeroXSwapV2Routes;

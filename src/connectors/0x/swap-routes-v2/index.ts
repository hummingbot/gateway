import { FastifyPluginAsync } from 'fastify';

import executeQuoteRoute from './execute-quote';
import executeSwapRoute from './execute-swap';
import getPriceRoute from './get-price';
import quoteSwapRoute from './quote-swap';

export const zeroXSwapV2Routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(getPriceRoute);
  await fastify.register(quoteSwapRoute);
  await fastify.register(executeQuoteRoute);
  await fastify.register(executeSwapRoute);
};

export default zeroXSwapV2Routes;

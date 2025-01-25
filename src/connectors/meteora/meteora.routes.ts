import type { FastifyPluginAsync } from 'fastify';
import sensible from '@fastify/sensible';

import { positionsOwnedRoute } from './routes/positionsOwned';
import { activeBinRoute } from './routes/activeBin';
import { quoteSwapRoute } from './routes/quoteSwap';
import { lbPairsRoute } from './routes/lbPairs';
import { quoteFeesRoute } from './routes/quoteFees';

export const meteoraRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);
  
  await fastify.register(positionsOwnedRoute);
  await fastify.register(activeBinRoute);
  await fastify.register(quoteSwapRoute);
  await fastify.register(lbPairsRoute);
  await fastify.register(quoteFeesRoute);
};

export default meteoraRoutes; 
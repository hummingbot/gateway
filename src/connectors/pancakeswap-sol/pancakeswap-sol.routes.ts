import { FastifyPluginAsync } from 'fastify';

import { pancakeswapSolClmmRoutes } from './clmm-routes';

export const pancakeswapSolRoutes: FastifyPluginAsync = async (fastify) => {
  // Register CLMM routes under /clmm prefix
  await fastify.register(pancakeswapSolClmmRoutes, { prefix: '/clmm' });
};

export default pancakeswapSolRoutes;

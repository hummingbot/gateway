import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

import { hyperswapAmmRoutes } from './amm-routes';

const hyperswapAmmRoutesWrapper: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  await fastify.register(async (instance) => {
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['/connector/hyperswap'];
      }
    });

    await instance.register(hyperswapAmmRoutes);
  });
};

export const hyperswapRoutes = {
  amm: hyperswapAmmRoutesWrapper,
};

export default hyperswapRoutes;

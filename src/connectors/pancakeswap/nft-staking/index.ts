import { FastifyPluginAsync } from 'fastify';

import masterchefKnowsPoolRoute from './masterchef-knows-pool';
import masterchefStakeRoutes from './masterchef-stake';
import masterchefUnstakeRoutes from './masterchef-unstake';
import masterchefUnstakeAndCloseRoutes from './masterchef-unstake-and-close';

export const pancakeswapNftStakingRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(masterchefStakeRoutes);
  await fastify.register(masterchefUnstakeRoutes);
  await fastify.register(masterchefUnstakeAndCloseRoutes);
  await fastify.register(masterchefKnowsPoolRoute);
};

export default pancakeswapNftStakingRoutes;

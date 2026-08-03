import { FastifyPluginAsync } from 'fastify';

import { accountInfoRoute } from './accountInfo';
import { boardInfoRoute } from './boardInfo';
import { checkpointRoute } from './checkpoint';
import { claimOreRoute } from './claimOre';
import { claimSolRoute } from './claimSol';
import { deployRoute } from './deploy';
import { systemInfoRoute } from './systemInfo';

export const oreRoutes: FastifyPluginAsync = async (fastify) => {
  // GET routes - Info endpoints
  await fastify.register(accountInfoRoute);
  await fastify.register(boardInfoRoute);
  await fastify.register(systemInfoRoute);

  // POST routes - Mining operations
  await fastify.register(deployRoute);
  await fastify.register(checkpointRoute);
  await fastify.register(claimSolRoute);
  await fastify.register(claimOreRoute);
};

export default oreRoutes;

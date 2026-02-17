import { FastifyPluginAsync } from 'fastify';

// GET routes - Info endpoints
import { accountInfoRoute } from './accountInfo';
import { boardInfoRoute } from './boardInfo';

// POST routes - Mining operations
import { checkpointRoute } from './checkpoint';
import { claimOreRoute } from './claimOre';
import { claimSolRoute } from './claimSol';

// POST routes - Staking operations
import { claimStakeRoute } from './claimStake';
import { deployRoute } from './deploy';
import { stakeRoute } from './stake';
import { systemInfoRoute } from './systemInfo';
import { unstakeRoute } from './unstake';

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

  // POST routes - Staking operations
  await fastify.register(stakeRoute);
  await fastify.register(unstakeRoute);
  await fastify.register(claimStakeRoute);
};

export default oreRoutes;

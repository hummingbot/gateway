import { FastifyPluginAsync } from 'fastify';

import { addLiquidityRoute } from './addLiquidity';
import { balanceRoute } from './balance';
import { daoInfoRoute } from './daoInfo';
import { executeConditionalSwapRoute } from './executeConditionalSwap';
import { executeSwapRoute } from './executeSwap';
import { listDaosRoute, listPoolsRoute } from './listDaos';
import { listProposalsRoute } from './listProposals';
import { poolInfoRoute } from './poolInfo';
import { proposalInfoRoute } from './proposalInfo';
import { quoteConditionalSwapRoute } from './quoteConditionalSwap';
import { quoteLiquidityRoute } from './quoteLiquidity';
import { quoteSwapRoute } from './quoteSwap';
import { removeLiquidityRoute } from './removeLiquidity';

export const metadaoFutarchyRoutes: FastifyPluginAsync = async (fastify) => {
  // DAO and Pool Discovery
  await fastify.register(listDaosRoute); // /daos - fetches from chain
  await fastify.register(listPoolsRoute); // /pools - cached from daos.json
  await fastify.register(listProposalsRoute);

  // Pool and Proposal info
  await fastify.register(daoInfoRoute); // /dao-info - lookup by pool address (from chain)
  await fastify.register(poolInfoRoute); // /pool-info - lookup by baseToken (uses cached lookup)
  await fastify.register(proposalInfoRoute);

  // Spot swap
  await fastify.register(quoteSwapRoute);
  await fastify.register(executeSwapRoute);

  // Liquidity
  await fastify.register(quoteLiquidityRoute);
  await fastify.register(addLiquidityRoute);
  await fastify.register(removeLiquidityRoute);

  // Conditional swap
  await fastify.register(quoteConditionalSwapRoute);
  await fastify.register(executeConditionalSwapRoute);

  // Balance
  await fastify.register(balanceRoute);
};

export default metadaoFutarchyRoutes;

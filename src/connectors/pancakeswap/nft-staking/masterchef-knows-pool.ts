import { FastifyPluginAsync } from 'fastify';

import { Pancakeswap } from '../pancakeswap';
import { MasterchefKnowsPoolRequest, MasterchefKnowsPoolRequestType, MasterchefKnowsPoolResponse } from '../schemas';

const masterchefKnowsPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: MasterchefKnowsPoolRequestType }>(
    '/masterchef-knows-pool',
    {
      schema: {
        tags: ['connectors'],
        operationId: 'postMasterchefKnowsPool',
        summary: 'Check whether a V3 pool is registered in MasterChef',
        description:
          'Returns the MasterChef pool ID and registration status for a PancakeSwap V3 pool address. ' +
          'Use this before staking to verify the pool is eligible for CAKE rewards. ' +
          'Correctly handles pid-0 (e.g. the CAKE/WBNB pool on BSC).',
        body: MasterchefKnowsPoolRequest,
        response: {
          200: MasterchefKnowsPoolResponse,
        },
      },
    },
    async (request, _reply) => {
      const { network = 'bsc', poolAddress } = request.body;

      if (!poolAddress) {
        throw fastify.httpErrors.badRequest('Missing required parameter: poolAddress');
      }

      const pancakeswap = await Pancakeswap.getInstance(network);
      const { pid, isRegistered } = await pancakeswap.getV3PoolIdFromMasterChef(poolAddress);

      return { registered: isRegistered, pid: isRegistered ? pid : undefined };
    },
  );
};

export default masterchefKnowsPoolRoute;

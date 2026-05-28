import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import { MasterchefUnstakeRequest, MasterchefUnstakeRequestType, MasterchefUnstakeResponse } from '../schemas';

const masterchefUnstakeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: MasterchefUnstakeRequestType }>(
    '/masterchef-unstake',
    {
      schema: {
        tags: ['connectors'],
        operationId: 'postMasterchefUnstake',
        summary: 'Unstake a V3 NFT position from MasterChef and harvest CAKE',
        description:
          'Calls MasterChef V3 withdraw(), which returns the NFT to the wallet and harvests any ' +
          'accumulated CAKE rewards in a single transaction. ' +
          'The NFT must currently be staked (owned by the MasterChef contract). ' +
          'Returns the gas fee and harvested reward amount (in wei).',
        body: MasterchefUnstakeRequest,
        response: {
          200: MasterchefUnstakeResponse,
        },
      },
    },
    async (request, _reply) => {
      const { network = 'bsc', walletAddress, tokenId } = request.body;

      if (!tokenId) {
        throw fastify.httpErrors.badRequest('Missing required parameter: tokenId');
      }
      if (!walletAddress) {
        throw fastify.httpErrors.badRequest('Missing required parameter: walletAddress');
      }

      const pancakeswap = await Pancakeswap.getInstance(network);

      try {
        const result = await pancakeswap.unstakeNft(tokenId, walletAddress);
        return {
          signature: result.txHash,
          status: result.status,
          tokenId,
          fee: result.fee,
        };
      } catch (error: any) {
        logger.error(`masterchef-unstake error: ${error.message}`);
        const msg: string = error.message ?? 'Unknown error during unstake';

        if (msg.includes('not staked in MasterChef') || msg.includes('Wallet not found')) {
          throw fastify.httpErrors.badRequest(msg);
        }
        throw fastify.httpErrors.internalServerError(msg);
      }
    },
  );
};

export default masterchefUnstakeRoutes;

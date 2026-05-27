import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import { MasterchefStakeRequest, MasterchefStakeRequestType, MasterchefStakeResponse } from '../schemas';

const masterchefStakeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: MasterchefStakeRequestType }>(
    '/masterchef-stake',
    {
      schema: {
        tags: ['connectors'],
        operationId: 'postMasterchefStake',
        summary: 'Stake a V3 NFT position into MasterChef for CAKE rewards',
        description:
          'Transfers a PancakeSwap V3 NFT position to the MasterChef V3 contract via safeTransferFrom, ' +
          'which registers the deposit and begins CAKE reward accrual. ' +
          'The wallet must own the NFT and have approved the MasterChef address (or approved-for-all). ' +
          'The pool must be registered in MasterChef and the position must have non-zero liquidity.',
        body: MasterchefStakeRequest,
        response: {
          200: MasterchefStakeResponse,
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
        const result = await pancakeswap.stakeNft(tokenId, walletAddress);
        return {
          signature: result.txHash,
          status: result.status,
          tokenId,
          fee: result.fee,
        };
      } catch (error: any) {
        logger.error(`masterchef-stake error: ${error.message}`);
        const msg: string = error.message ?? 'Unknown error during stake';

        if (
          msg.includes('not owned by') ||
          msg.includes('Insufficient NFT approval') ||
          msg.includes('not registered in MasterChef') ||
          msg.includes('zero liquidity')
        ) {
          throw fastify.httpErrors.badRequest(msg);
        }
        throw fastify.httpErrors.internalServerError(msg);
      }
    },
  );
};

export default masterchefStakeRoutes;

import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../../services/logger';
import { closePosition } from '../clmm-routes/closePosition';
import { Pancakeswap } from '../pancakeswap';
import {
  MasterchefUnstakeAndCloseRequest,
  MasterchefUnstakeAndCloseRequestType,
  MasterchefUnstakeAndCloseResponse,
} from '../schemas';

const masterchefUnstakeAndCloseRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: MasterchefUnstakeAndCloseRequestType }>(
    '/masterchef-unstake-and-close',
    {
      schema: {
        tags: ['connectors'],
        operationId: 'postMasterchefUnstakeAndClose',
        summary: 'Unstake a V3 NFT from MasterChef and close the position',
        description:
          'Two-step atomic operation: (1) unstakes the NFT from MasterChef V3 and harvests CAKE, ' +
          'then (2) closes the V3 position (removes all liquidity, collects fees, burns the NFT). ' +
          'The unstake transaction is confirmed on-chain before the close is submitted, ' +
          'ensuring the NFT is fully returned to the wallet before closePosition is called. ' +
          'Returns transaction hashes for both steps.',
        body: MasterchefUnstakeAndCloseRequest,
        response: {
          200: MasterchefUnstakeAndCloseResponse,
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

      // Step 1: unstake NFT from MasterChef (waits for on-chain confirmation via tx.wait(1))
      let unstakeResult: { txHash: string; status: number; fee: string; rewardAmount: string };
      try {
        unstakeResult = await pancakeswap.unstakeNft(tokenId, walletAddress);
      } catch (error: any) {
        logger.error(`masterchef-unstake-and-close unstake step error: ${error.message}`);
        const msg: string = error.message ?? 'Unstake failed';
        if (msg.includes('not staked in MasterChef') || msg.includes('Wallet not found')) {
          throw fastify.httpErrors.badRequest(msg);
        }
        throw fastify.httpErrors.internalServerError(msg);
      }

      // Step 2: close the position — NFT is confirmed back in wallet after tx.wait(1) above
      let closeResult: Awaited<ReturnType<typeof closePosition>>;
      try {
        closeResult = await closePosition(network, walletAddress, tokenId);
      } catch (error: any) {
        logger.error(`masterchef-unstake-and-close close step error: ${error.message}`);
        throw fastify.httpErrors.internalServerError(
          `Unstake succeeded (${unstakeResult.txHash}) but close failed: ${error.message}`,
        );
      }

      return {
        unstakeSignature: unstakeResult.txHash,
        closeSignature: closeResult.signature,
        status: closeResult.status,
        tokenId,
        fee: unstakeResult.fee,
      };
    },
  );
};

export default masterchefUnstakeAndCloseRoutes;

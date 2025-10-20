import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { CollectFeesResponse, CollectFeesResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSolClmmCollectFeesRequest } from '../schemas';

import { removeLiquidity } from './removeLiquidity';

async function collectFees(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  logger.info(`Collecting fees from position ${positionAddress} by removing 1% liquidity`);

  // Use the clever Raydium approach: remove 1% of liquidity to collect fees
  // This withdraws a tiny amount of liquidity + all accumulated fees
  const removeLiquidityResponse = await removeLiquidity(_fastify, network, walletAddress, positionAddress, 1);

  if (removeLiquidityResponse.status !== 1 || !removeLiquidityResponse.data) {
    return {
      signature: removeLiquidityResponse.signature,
      status: removeLiquidityResponse.status,
    };
  }

  // The fees are included in the amounts removed
  // Since we only removed 1%, most of the tokens received are fees
  const baseFeeCollected = removeLiquidityResponse.data.baseTokenAmountRemoved;
  const quoteFeeCollected = removeLiquidityResponse.data.quoteTokenAmountRemoved;

  logger.info(`Fees collected. Base: ${baseFeeCollected}, Quote: ${quoteFeeCollected}`);

  return {
    signature: removeLiquidityResponse.signature,
    status: 1, // CONFIRMED
    data: {
      fee: removeLiquidityResponse.data.fee,
      baseFeeAmountCollected: baseFeeCollected,
      quoteFeeAmountCollected: quoteFeeCollected,
    },
  };
}

export { collectFees };

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof PancakeswapSolClmmCollectFeesRequest>;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect accumulated fees from a PancakeSwap Solana CLMM position (removes 1% liquidity)',
        tags: ['/connector/pancakeswap-sol'],
        body: PancakeswapSolClmmCollectFeesRequest,
        response: {
          200: CollectFeesResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network = 'mainnet-beta', walletAddress, positionAddress } = request.body;

        return await collectFees(fastify, network, walletAddress, positionAddress);
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to collect fees');
      }
    },
  );
};

export default collectFeesRoute;

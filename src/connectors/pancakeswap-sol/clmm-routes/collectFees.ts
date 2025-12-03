import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { CollectFeesResponse, CollectFeesResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { PancakeswapSolClmmCollectFeesRequest } from '../schemas';

import { removeLiquidity } from './removeLiquidity';

async function collectFees(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  logger.info(`Collecting fees from position ${positionAddress} by removing 1% liquidity`);

  // Use the clever Raydium approach: remove 1% of liquidity to collect fees
  // This withdraws a tiny amount of liquidity + all accumulated fees
  const removeLiquidityResponse = await removeLiquidity(network, walletAddress, positionAddress, 1);

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

        return await collectFees(network, walletAddress!, positionAddress);
      } catch (e: any) {
        logger.error('Collect fees error:', e);
        // Re-throw httpErrors as-is
        if (e.statusCode) {
          throw e;
        }
        // Handle unknown errors
        const errorMessage = e.message || 'Failed to collect fees';
        throw httpErrors.internalServerError(errorMessage);
      }
    },
  );
};

export default collectFeesRoute;

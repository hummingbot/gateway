import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { RemoveLiquidityOperation } from '../../../../packages/sdk/src/solana/raydium/operations/clmm/remove-liquidity';
import { Solana } from '../../../chains/solana/solana';
import {
  RemoveLiquidityResponse,
  RemoveLiquidityRequestType,
  RemoveLiquidityResponseType,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumClmmRemoveLiquidityRequest } from '../schemas';

export async function removeLiquidity(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
  percentageToRemove: number,
  _closePosition: boolean = false,
): Promise<RemoveLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Create SDK operation
  const operation = new RemoveLiquidityOperation(raydium, solana);

  // Execute using SDK
  const result = await operation.execute({
    network,
    walletAddress,
    poolAddress: '', // Not needed for remove liquidity
    positionAddress,
    percentageToRemove,
  });

  if (result.status === 1 && result.data) {
    logger.info(
      `Liquidity removed from position ${positionAddress}: ${result.data.baseTokenAmountRemoved.toFixed(4)} + ${result.data.quoteTokenAmountRemoved.toFixed(4)}`,
    );
  }

  return result;
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof RaydiumClmmRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from Raydium CLMM position',
        tags: ['/connector/raydium'],
        body: RaydiumClmmRemoveLiquidityRequest,
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress, percentageToRemove } = request.body;

        return await removeLiquidity(fastify, network, walletAddress, positionAddress, percentageToRemove, false);
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default removeLiquidityRoute;

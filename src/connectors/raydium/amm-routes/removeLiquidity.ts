import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  RemoveLiquidityRequestType,
  RemoveLiquidityResponse,
  RemoveLiquidityResponseType,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumAmmRemoveLiquidityRequest } from '../schemas';
import { RemoveLiquidityOperation } from '../../../../packages/sdk/src/solana/raydium/operations/amm/remove-liquidity';

async function removeLiquidity(
  network: string,
  walletAddress: string,
  poolAddress: string,
  percentageToRemove: number,
): Promise<RemoveLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Create SDK operation
  const operation = new RemoveLiquidityOperation(raydium, solana);

  // Execute using SDK
  const result = await operation.execute({
    network,
    poolAddress,
    walletAddress,
    percentageToRemove,
  });

  if (result.status === 1 && result.data) {
    logger.info(
      `Liquidity removed from pool ${poolAddress}: ${result.data.baseTokenAmountRemoved.toFixed(4)} + ${result.data.quoteTokenAmountRemoved.toFixed(4)}`,
    );
  }

  return result;
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  // const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: Static<typeof RaydiumAmmRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Raydium AMM/CPMM pool',
        tags: ['/connector/raydium'],
        body: RaydiumAmmRemoveLiquidityRequest,
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, poolAddress, percentageToRemove } = request.body;

        return await removeLiquidity(network, walletAddress, poolAddress, percentageToRemove);
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default removeLiquidityRoute;

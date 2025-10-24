import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { AddLiquidityResponse, AddLiquidityRequestType, AddLiquidityResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumClmmAddLiquidityRequest } from '../schemas';
import { AddLiquidityOperation } from '../../../../packages/sdk/src/solana/raydium/operations/clmm/add-liquidity';

async function addLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct?: number,
): Promise<AddLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Create SDK operation
  const operation = new AddLiquidityOperation(raydium, solana);

  // Execute using SDK
  const result = await operation.execute({
    network,
    walletAddress,
    poolAddress: '', // Not needed for add liquidity
    positionAddress,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  });

  if (result.status === 1 && result.data) {
    logger.info(
      `Liquidity added to position ${positionAddress}: ${result.data.baseTokenAmountAdded.toFixed(4)} + ${result.data.quoteTokenAmountAdded.toFixed(4)}`,
    );
  }

  return result;
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof RaydiumClmmAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to existing Raydium CLMM position',
        tags: ['/connector/raydium'],
        body: RaydiumClmmAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress, baseTokenAmount, quoteTokenAmount, slippagePct } =
          request.body;

        return await addLiquidity(
          network,
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default addLiquidityRoute;

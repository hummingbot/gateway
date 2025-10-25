import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { ClosePositionOperation } from '../../../../packages/sdk/src/solana/raydium/operations/clmm/close-position';
import { Solana } from '../../../chains/solana/solana';
import {
  ClosePositionResponse,
  ClosePositionRequestType,
  ClosePositionResponseType,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumClmmClosePositionRequest } from '../schemas';

async function closePosition(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<ClosePositionResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Create SDK operation
  const operation = new ClosePositionOperation(raydium, solana);

  // Execute using SDK
  const result = await operation.execute({
    network,
    walletAddress,
    poolAddress: '', // Not needed for close position
    positionAddress,
  });

  if (result.status === 1 && result.data) {
    logger.info(
      `CLMM position closed: ${positionAddress} - Rent refunded: ${result.data.positionRentReclaimed.toFixed(4)} SOL`,
    );
  }

  // Transform SDK result to API response format
  const apiResponse: ClosePositionResponseType = {
    signature: result.signature,
    status: result.status,
    data: result.data
      ? {
          fee: result.data.fee,
          baseTokenAmountRemoved: result.data.baseTokenAmountRemoved,
          quoteTokenAmountRemoved: result.data.quoteTokenAmountRemoved,
          baseFeeAmountCollected: result.data.feesCollected.base,
          quoteFeeAmountCollected: result.data.feesCollected.quote,
          positionRentRefunded: result.data.positionRentReclaimed,
        }
      : undefined,
  };

  return apiResponse;
}

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: Static<typeof RaydiumClmmClosePositionRequest>;
    Reply: ClosePositionResponseType;
  }>(
    '/close-position',
    {
      schema: {
        description: 'Close a Raydium CLMM position',
        tags: ['/connector/raydium'],
        body: RaydiumClmmClosePositionRequest,
        response: {
          200: ClosePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress } = request.body;
        const networkToUse = network;

        return await closePosition(networkToUse, walletAddress, positionAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default closePositionRoute;

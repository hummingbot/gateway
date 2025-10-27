import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { ClosePositionOperation } from '@gateway-sdk/solana/meteora/operations/clmm';

import { Solana } from '../../../chains/solana/solana';
import { ClosePositionResponse, ClosePositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmClosePositionRequest } from '../schemas';

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof MeteoraClmmClosePositionRequest>;
    Reply: ClosePositionResponseType;
  }>(
    '/close-position',
    {
      schema: {
        description: 'Close a Meteora position',
        tags: ['/connector/meteora'],
        body: MeteoraClmmClosePositionRequest,
        response: {
          200: ClosePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress } = request.body;

        const solana = await Solana.getInstance(network);
        const meteora = await Meteora.getInstance(network);

        // Use SDK operation
        const operation = new ClosePositionOperation(meteora, solana);
        const result = await operation.execute({
          network,
          walletAddress,
          positionAddress,
        });

        // Transform SDK result to API response format
        const apiResponse: ClosePositionResponseType = {
          signature: result.signature,
          status: result.status,
          data: result.data
            ? {
                fee: result.data.fee,
                baseTokenAmountRemoved: result.data.baseTokenAmountRemoved,
                quoteTokenAmountRemoved: result.data.quoteTokenAmountRemoved,
                baseFeeAmountCollected: result.data.baseFeesClaimed,
                quoteFeeAmountCollected: result.data.quoteFeesClaimed,
                positionRentRefunded: result.data.rentReclaimed,
              }
            : undefined,
        };

        return apiResponse;
      } catch (e) {
        logger.error('Close position route error:', {
          message: e.message || 'Unknown error',
          name: e.name,
          code: e.code,
          statusCode: e.statusCode,
          stack: e.stack,
          positionAddress: request.body.positionAddress,
          network: request.body.network,
          walletAddress: request.body.walletAddress,
        });

        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default closePositionRoute;

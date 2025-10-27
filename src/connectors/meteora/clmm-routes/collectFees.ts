import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { CollectFeesOperation } from '@gateway-sdk/solana/meteora/operations/clmm';

import { Solana } from '../../../chains/solana/solana';
import { CollectFeesResponse, CollectFeesResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmCollectFeesRequest } from '../schemas';

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof MeteoraClmmCollectFeesRequest>;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees from a Meteora position',
        tags: ['/connector/meteora'],
        body: MeteoraClmmCollectFeesRequest,
        response: {
          200: CollectFeesResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress } = request.body;

        const solana = await Solana.getInstance(network);
        const meteora = await Meteora.getInstance(network);

        // Use SDK operation
        const operation = new CollectFeesOperation(meteora, solana);
        const result = await operation.execute({
          network,
          walletAddress,
          positionAddress,
        });

        // Transform SDK result to API response format
        const apiResponse: CollectFeesResponseType = {
          signature: result.signature,
          status: result.status,
          data: result.data
            ? {
                fee: result.data.fee,
                baseFeeAmountCollected: result.data.baseFeesClaimed,
                quoteFeeAmountCollected: result.data.quoteFeesClaimed,
              }
            : undefined,
        };

        return apiResponse;
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

export default collectFeesRoute;

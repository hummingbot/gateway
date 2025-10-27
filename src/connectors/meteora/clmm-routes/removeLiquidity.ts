import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { RemoveLiquidityOperation } from '@gateway-sdk/solana/meteora/operations/clmm';

import { Solana } from '../../../chains/solana/solana';
import { RemoveLiquidityResponse, RemoveLiquidityResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmRemoveLiquidityRequest } from '../schemas';

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof MeteoraClmmRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Meteora position',
        tags: ['/connector/meteora'],
        body: MeteoraClmmRemoveLiquidityRequest,
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress, liquidityPct } = request.body;

        const solana = await Solana.getInstance(network);
        const meteora = await Meteora.getInstance(network);

        // Use SDK operation
        const operation = new RemoveLiquidityOperation(meteora, solana);
        const result = await operation.execute({
          network,
          walletAddress,
          positionAddress,
          percentageToRemove: liquidityPct,
        });

        return result;
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

export default removeLiquidityRoute;

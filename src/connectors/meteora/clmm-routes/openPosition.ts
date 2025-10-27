import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { OpenPositionOperation } from '@gateway-sdk/solana/meteora/operations/clmm';

import { Solana } from '../../../chains/solana/solana';
import { OpenPositionResponse, OpenPositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraConfig } from '../meteora.config';
import { MeteoraClmmOpenPositionRequest } from '../schemas';

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof MeteoraClmmOpenPositionRequest>;
    Reply: OpenPositionResponseType;
  }>(
    '/open-position',
    {
      schema: {
        description: 'Open a new Meteora position',
        tags: ['/connector/meteora'],
        body: MeteoraClmmOpenPositionRequest,
        response: {
          200: OpenPositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          strategyType,
        } = request.body;

        const solana = await Solana.getInstance(network);
        const meteora = await Meteora.getInstance(network);

        // Use SDK operation
        const operation = new OpenPositionOperation(meteora, solana, MeteoraConfig.config);
        const result = await operation.execute({
          network,
          walletAddress,
          poolAddress,
          lowerPrice,
          upperPrice,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          strategyType,
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

export default openPositionRoute;

import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { AddLiquidityOperation } from '@gateway-sdk/solana/meteora/operations/clmm';

import { Solana } from '../../../chains/solana/solana';
import { AddLiquidityResponse, AddLiquidityResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraConfig } from '../meteora.config';
import { MeteoraClmmAddLiquidityRequest } from '../schemas';

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof MeteoraClmmAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Meteora position',
        tags: ['/connector/meteora'],
        body: MeteoraClmmAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress, baseTokenAmount, quoteTokenAmount, slippagePct } =
          request.body;

        const solana = await Solana.getInstance(network);
        const meteora = await Meteora.getInstance(network);

        // Use SDK operation
        const operation = new AddLiquidityOperation(meteora, solana, MeteoraConfig.config);
        const result = await operation.execute({
          network,
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
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

export default addLiquidityRoute;

import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { PositionInfo, PositionInfoSchema, GetPositionInfoRequestType } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumAmmGetPositionInfoRequest } from '../schemas';
import { getPositionInfo } from '../../../../packages/sdk/src/solana/raydium/operations/amm/position-info';

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPositionInfoRequestType;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get info about a Raydium AMM position',
        tags: ['/connector/raydium'],
        querystring: RaydiumAmmGetPositionInfoRequest,
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const { poolAddress, walletAddress, network } = request.query;

        const raydium = await Raydium.getInstance(network);
        const solana = await Solana.getInstance(network);

        // Call SDK operation
        const result = await getPositionInfo(raydium, solana, {
          network,
          walletAddress,
          poolAddress,
        });

        return result;
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, e.message);
        }
        throw fastify.httpErrors.internalServerError('Failed to fetch position info');
      }
    },
  );
};

export default positionInfoRoute;

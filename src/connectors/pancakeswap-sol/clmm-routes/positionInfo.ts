import { FastifyPluginAsync } from 'fastify';

import { GetPositionInfoRequestType, PositionInfo, PositionInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import { PancakeswapSolClmmGetPositionInfoRequest } from '../schemas';

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPositionInfoRequestType;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get CLMM position information from PancakeSwap Solana',
        tags: ['/connector/pancakeswap-sol'],
        querystring: PancakeswapSolClmmGetPositionInfoRequest,
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request): Promise<PositionInfo> => {
      try {
        const { network = 'mainnet-beta', positionAddress } = request.query;

        const pancakeswap = await PancakeswapSol.getInstance(network);

        if (!positionAddress) {
          throw fastify.httpErrors.badRequest('Position address is required');
        }

        const positionInfo = await pancakeswap.getPositionInfo(positionAddress);
        if (!positionInfo) {
          throw fastify.httpErrors.notFound(`Position not found: ${positionAddress}`);
        }

        return positionInfo;
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to fetch position info');
      }
    },
  );
};

export default positionInfoRoute;

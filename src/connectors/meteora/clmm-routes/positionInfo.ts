import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { PositionInfo, PositionInfoSchema, GetPositionInfoRequestType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmGetPositionInfoRequest } from '../schemas';

export async function getPositionInfo(
  fastify: FastifyInstance,
  network: string,
  positionAddress: string,
): Promise<PositionInfo> {
  const meteora = await Meteora.getInstance(network);

  if (!positionAddress) {
    throw fastify.httpErrors.badRequest('Position address is required');
  }

  const positionInfo = await meteora.getPositionInfoByAddress(positionAddress);
  if (!positionInfo) {
    throw fastify.httpErrors.notFound(`Position not found: ${positionAddress}`);
  }
  return positionInfo;
}

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPositionInfoRequestType;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get details for a specific Meteora position',
        tags: ['/connector/meteora'],
        querystring: MeteoraClmmGetPositionInfoRequest,
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const { positionAddress } = request.query;
        const network = request.query.network;
        return await getPositionInfo(fastify, network, positionAddress);
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

export default positionInfoRoute;

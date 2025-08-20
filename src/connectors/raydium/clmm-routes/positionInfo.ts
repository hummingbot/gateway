import { FastifyPluginAsync } from 'fastify';

import { PositionInfo, PositionInfoSchema, GetPositionInfoRequestType } from '../../../schemas/clmm-schema';
import { Raydium } from '../raydium';
import { RaydiumClmmGetPositionInfoRequest } from '../schemas';

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPositionInfoRequestType;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get info about a Raydium CLMM position',
        tags: ['/connector/raydium'],
        querystring: RaydiumClmmGetPositionInfoRequest,
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request) => {
      const { network = 'mainnet-beta', positionAddress } = request.query;
      const raydium = await Raydium.getInstance(network);
      return raydium.getPositionInfo(positionAddress);
    },
  );
};

export default positionInfoRoute;

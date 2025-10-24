import { FastifyPluginAsync } from 'fastify';

import { PositionInfo, PositionInfoSchema, GetPositionInfoRequestType } from '../../../schemas/clmm-schema';
import { Raydium } from '../raydium';
import { RaydiumClmmGetPositionInfoRequest } from '../schemas';
import { getPositionInfo } from '../../../../packages/sdk/src/solana/raydium/operations/clmm/position-info';

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

      // Call SDK operation
      const result = await getPositionInfo(raydium, {
        network,
        positionAddress,
      });

      return result;
    },
  );
};

export default positionInfoRoute;

import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { PositionInfo, PositionInfoSchema, GetPositionInfoRequestType } from '../../../schemas/clmm-schema';
import { Raydium } from '../raydium';
import { RaydiumClmmGetPositionInfoRequest } from '../schemas';

export async function getPositionInfo(
  _fastify: FastifyInstance,
  network: string,
  positionAddress: string,
): Promise<PositionInfo> {
  const raydium = await Raydium.getInstance(network);
  return raydium.getPositionInfo(positionAddress);
}

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
      return await getPositionInfo(fastify, network, positionAddress);
    },
  );
};

export default positionInfoRoute;

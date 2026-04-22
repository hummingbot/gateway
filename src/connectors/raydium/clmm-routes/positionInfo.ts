import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { PositionInfo, PositionInfoSchema, GetPositionInfoRequestType } from '../../../schemas/clmm-schema';
import { Raydium } from '../raydium';
import { RaydiumClmmGetPositionInfoRequest } from '../schemas';

export async function getPositionInfo(
  fastify: FastifyInstance,
  network: string,
  positionAddress: string,
): Promise<PositionInfo> {
  const raydium = await Raydium.getInstance(network);

  if (!positionAddress) {
    throw fastify.httpErrors.badRequest('Position address is required');
  }

  // Fetch position info directly from RPC
  const positionInfo = await raydium.getPositionInfo(positionAddress);
  if (!positionInfo) {
    throw fastify.httpErrors.notFound(`Position not found or closed: ${positionAddress}`);
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
        description: 'Get info about a Raydium CLMM position',
        tags: ['/connector/raydium'],
        querystring: RaydiumClmmGetPositionInfoRequest,
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const { network = 'mainnet-beta', positionAddress } = request.query;
        return await getPositionInfo(fastify, network, positionAddress);
      } catch (e) {
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to fetch position info');
      }
    },
  );
};

export default positionInfoRoute;

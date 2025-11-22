import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  PositionInfo as AMMPositionInfo,
  GetPositionInfoRequestType as AMMGetPositionInfoRequestType,
} from '../../../schemas/amm-schema';
import {
  PositionInfo as CLMMPositionInfo,
  PositionInfoSchema as CLMMPositionInfoSchema,
  GetPositionInfoRequestType as CLMMGetPositionInfoRequestType,
  GetPositionInfoRequest as CLMMGetPositionInfoRequest,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';

export async function osmosisPoolPositionInfo(
  fastify: FastifyInstance,
  request: AMMGetPositionInfoRequestType | CLMMGetPositionInfoRequestType,
  poolType: string,
): Promise<AMMPositionInfo | CLMMPositionInfo> {
  let networkToUse = request.network ? request.network : 'mainnet';
  const osmosis = await Osmosis.getInstance(networkToUse);
  await osmosis.init();
  networkToUse = osmosis.network;
  logger.info(`Network: ${networkToUse}, Chain ID: ${osmosis.chainName}`);
  const response = await osmosis.controller.poolPosition(osmosis, fastify, request, poolType);
  return response;
}

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Osmosis.getWalletAddressExample();

  fastify.get<{
    Querystring: CLMMGetPositionInfoRequestType;
    Reply: CLMMPositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get position information for a osmosis CLMM pool',
        tags: ['osmosis/connector'],
        querystring: {
          ...CLMMGetPositionInfoRequest,
          properties: {
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            poolAddress: {
              type: 'string',
              examples: [''],
            },
          },
        },
        response: {
          200: CLMMPositionInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        // Validate essential parameters
        const { positionAddress } = request.query;
        if (!positionAddress) {
          throw fastify.httpErrors.badRequest('Pool address must be provided');
        }

        return (await osmosisPoolPositionInfo(fastify, request.query, 'clmm')) as CLMMPositionInfo;
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to get position info');
      }
    },
  );
};

export default positionInfoRoute;

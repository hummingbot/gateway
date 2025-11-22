import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  PositionInfo as AMMPositionInfo,
  PositionInfoSchema as AMMPositionInfoSchema,
} from '../../../schemas/amm-schema';
import {
  PositionInfoSchema as CLMMPositionInfoSchema,
  GetPositionInfoRequest as CLMMGetPositionInfoRequest,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';

const PositionsOwnedRequest = Type.Object({
  network: Type.Optional(Type.String({ examples: ['mainnet'], default: 'mainnet' })),
  walletAddress: Type.String({ examples: ['<osmosis wallet address>'] }),
});
type PositionsOwnedRequestType = Static<typeof PositionsOwnedRequest>;

const AMMAllPositionsOwnedResponse = Type.Array(AMMPositionInfoSchema);
const CLMMAllPositionsOwnedResponse = Type.Array(CLMMPositionInfoSchema);
type AMMAllPositionsOwnedResponseType = Static<typeof AMMAllPositionsOwnedResponse>;
type CLMMAllPositionsOwnedResponseType = Static<typeof CLMMAllPositionsOwnedResponse>;

export async function osmosisAllPoolPositions(
  fastify: FastifyInstance,
  request: PositionsOwnedRequestType,
  poolType: string,
): Promise<AMMAllPositionsOwnedResponseType | CLMMAllPositionsOwnedResponseType> {
  let networkToUse = request.network ? request.network : 'mainnet';
  const osmosis = await Osmosis.getInstance(networkToUse);
  await osmosis.init();
  networkToUse = osmosis.network;
  logger.info(`Network: ${networkToUse}, Chain ID: ${osmosis.chainName}`);
  const response = await osmosis.controller.allPoolPositions(osmosis, fastify, request, poolType);
  return response;
}

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Osmosis.getWalletAddressExample();

  fastify.get<{
    Querystring: typeof PositionsOwnedRequest.static;
    Reply: AMMAllPositionsOwnedResponseType;
  }>(
    '/positions-owned',
    {
      schema: {
        description: 'Get all AMM positions for wallet address',
        tags: ['osmosis/connector'],
        querystring: {
          ...CLMMGetPositionInfoRequest,
          properties: {
            network: { type: 'string', default: 'mainnet' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
          },
        },
        response: {
          200: CLMMPositionInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const { walletAddress: requestedWalletAddress } = request.query;

        // Validate essential parameters
        if (!requestedWalletAddress) {
          throw fastify.httpErrors.badRequest(
            'Either pool address or both base token and quote token must be provided',
          );
        }

        return (await osmosisAllPoolPositions(fastify, request.query, 'amm')) as unknown as AMMPositionInfo[];
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

export default positionsOwnedRoute;

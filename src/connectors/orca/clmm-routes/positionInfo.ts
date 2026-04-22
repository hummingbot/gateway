import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { PositionInfo, PositionInfoSchema, GetPositionInfoRequestType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { OrcaClmmGetPositionInfoRequest } from '../schemas';

export async function getPositionInfo(
  fastify: FastifyInstance,
  network: string,
  positionAddress: string,
  walletAddress?: string,
): Promise<PositionInfo> {
  const orca = await Orca.getInstance(network);

  if (!positionAddress) {
    throw fastify.httpErrors.badRequest('Position address is required');
  }

  // Get wallet address from Solana class if not provided
  let resolvedWalletAddress = walletAddress;
  if (!resolvedWalletAddress) {
    resolvedWalletAddress = await Solana.getWalletAddressExample();
  }

  // Validate wallet address
  if (resolvedWalletAddress) {
    try {
      new PublicKey(resolvedWalletAddress);
    } catch (error) {
      throw fastify.httpErrors.badRequest(`Invalid wallet address: ${resolvedWalletAddress}`);
    }
  }

  const positionInfo = await orca.getPositionInfo(positionAddress, resolvedWalletAddress);
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
        description: 'Get details for a specific Orca position',
        tags: ['/connector/orca'],
        querystring: OrcaClmmGetPositionInfoRequest,
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const { positionAddress, walletAddress } = request.query;
        const network = request.query.network;
        return await getPositionInfo(fastify, network, positionAddress, walletAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e; // Re-throw HttpErrors with original message
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default positionInfoRoute;

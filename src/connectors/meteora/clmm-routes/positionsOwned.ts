import { Type } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { GetPositionsOwnedRequestType, PositionInfo, PositionInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmGetPositionsOwnedRequest } from '../schemas';
// Using Fastify's native error handling
const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) => `Invalid Solana address: ${address}`;

export async function getPositionsOwned(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
): Promise<PositionInfo[]> {
  const meteora = await Meteora.getInstance(network);

  // Validate wallet address
  try {
    new PublicKey(walletAddress);
  } catch (error) {
    throw fastify.httpErrors.badRequest(INVALID_SOLANA_ADDRESS_MESSAGE('wallet'));
  }

  const positions = await meteora.getAllPositionsForWallet(new PublicKey(walletAddress));
  return positions;
}

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPositionsOwnedRequestType;
    Reply: PositionInfo[];
  }>(
    '/positions-owned',
    {
      schema: {
        description: "Retrieve all positions owned by a user's wallet across all Meteora pools",
        tags: ['/connector/meteora'],
        querystring: MeteoraClmmGetPositionsOwnedRequest,
        response: {
          200: Type.Array(PositionInfoSchema),
        },
      },
    },
    async (request) => {
      try {
        const network = request.query.network;
        const walletAddress = request.query.walletAddress;
        return await getPositionsOwned(fastify, network, walletAddress);
      } catch (e: any) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        // If it's an Error object with a message, use that message
        if (e.message) {
          throw fastify.httpErrors.serviceUnavailable(e.message);
        }
        throw fastify.httpErrors.internalServerError('Failed to fetch positions');
      }
    },
  );
};

export default positionsOwnedRoute;

import { Type } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { getSolanaChainConfig } from '../../../chains/solana/solana.config';
import { GetPositionsOwnedRequestType, PositionInfo, PositionInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraClmmGetPositionsOwnedRequest } from '../schemas';
// Using Fastify's native error handling
const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) => `Invalid Solana address: ${address}`;

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPositionsOwnedRequestType;
    Reply: PositionInfo[];
  }>(
    '/positions-owned',
    {
      schema: {
        description: "Retrieve a list of positions owned by a user's wallet in a specific Meteora pool",
        tags: ['/connector/meteora'],
        querystring: MeteoraClmmGetPositionsOwnedRequest,
        response: {
          200: Type.Array(PositionInfoSchema),
        },
      },
    },
    async (request) => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network;
        const meteora = await Meteora.getInstance(network);

        // Get wallet address - use provided or default
        const walletAddressToUse = request.query.walletAddress || getSolanaChainConfig().defaultWallet;

        // Validate addresses first
        try {
          new PublicKey(poolAddress);
          new PublicKey(walletAddressToUse);
        } catch (error) {
          const invalidAddress = error.message.includes(poolAddress) ? 'pool' : 'wallet';
          throw fastify.httpErrors.badRequest(INVALID_SOLANA_ADDRESS_MESSAGE(invalidAddress));
        }

        const positions = await meteora.getPositionsInPool(poolAddress, new PublicKey(walletAddressToUse));

        return positions;
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

export default positionsOwnedRoute;

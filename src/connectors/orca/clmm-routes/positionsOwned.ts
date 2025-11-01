import { Type } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { getSolanaChainConfig } from '../../../chains/solana/solana.config';
import { GetPositionsOwnedRequestType, PositionInfo, PositionInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { OrcaClmmGetPositionsOwnedRequest } from '../schemas';
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
        description: "Retrieve a list of positions owned by a user's wallet in a specific Orca pool",
        tags: ['/connector/orca'],
        querystring: OrcaClmmGetPositionsOwnedRequest,
        response: {
          200: Type.Array(PositionInfoSchema),
        },
      },
    },
    async (request) => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network;
        const orca = await Orca.getInstance(network);

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

        const positions = await orca.getPositionsInPool(poolAddress, walletAddressToUse);

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

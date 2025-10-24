import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { PositionInfoSchema, GetPositionsOwnedRequestType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumClmmGetPositionsOwnedRequest } from '../schemas';
import { getPositionsOwned } from '../../../../packages/sdk/src/solana/raydium/operations/clmm/positions-owned';

const GetPositionsOwnedResponse = Type.Array(PositionInfoSchema);

type GetPositionsOwnedResponseType = Static<typeof GetPositionsOwnedResponse>;

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  // Remove wallet address example population code

  fastify.get<{
    Querystring: GetPositionsOwnedRequestType;
    Reply: GetPositionsOwnedResponseType;
  }>(
    '/positions-owned',
    {
      schema: {
        description: "Retrieve a list of positions owned by a user's wallet in a specific Raydium CLMM pool",
        tags: ['/connector/raydium'],
        querystring: RaydiumClmmGetPositionsOwnedRequest,
        response: {
          200: GetPositionsOwnedResponse,
        },
      },
    },
    async (request) => {
      try {
        const { poolAddress, walletAddress, network } = request.query;
        const raydium = await Raydium.getInstance(network);

        // Call SDK operation
        const result = await getPositionsOwned(raydium, {
          network,
          walletAddress,
          poolAddress,
        });

        return result;
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

import { FastifyPluginAsync } from 'fastify';

import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Ore } from '../ore';
import {
  OreAccountInfoRequest,
  OreAccountInfoRequestType,
  OreAccountInfoResponse,
  OreAccountInfoResponseType,
} from '../schemas';

export const accountInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: OreAccountInfoRequestType;
    Reply: OreAccountInfoResponseType;
  }>(
    '/account-info',
    {
      schema: {
        description: 'Get ORE account information (miner + stake) for a wallet',
        tags: ['/connector/ore'],
        querystring: OreAccountInfoRequest,
        response: {
          200: OreAccountInfoResponse,
        },
      },
    },
    async (request) => {
      try {
        const network = request.query.network || 'mainnet-beta';
        const { walletAddress, roundId } = request.query;

        if (!walletAddress) {
          throw httpErrors.badRequest('walletAddress is required');
        }

        const ore = await Ore.getInstance(network);
        return await ore.getAccountInfo(walletAddress, roundId);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default accountInfoRoute;

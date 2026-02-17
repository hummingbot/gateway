import { FastifyPluginAsync } from 'fastify';

import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Ore } from '../ore';
import {
  OreBoardInfoRequest,
  OreBoardInfoRequestType,
  OreBoardInfoResponse,
  OreBoardInfoResponseType,
} from '../schemas';

export const boardInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: OreBoardInfoRequestType;
    Reply: OreBoardInfoResponseType;
  }>(
    '/board-info',
    {
      schema: {
        description: 'Get ORE board and current round information',
        tags: ['/connector/ore'],
        querystring: OreBoardInfoRequest,
        response: {
          200: OreBoardInfoResponse,
        },
      },
    },
    async (request) => {
      try {
        const network = request.query.network || 'mainnet-beta';
        const { roundId } = request.query;
        const ore = await Ore.getInstance(network);
        return await ore.getBoardInfo(roundId);
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

export default boardInfoRoute;

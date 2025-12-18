import { FastifyPluginAsync } from 'fastify';

import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Ore } from '../ore';
import {
  OreSystemInfoRequest,
  OreSystemInfoRequestType,
  OreSystemInfoResponse,
  OreSystemInfoResponseType,
} from '../schemas';

export const systemInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: OreSystemInfoRequestType;
    Reply: OreSystemInfoResponseType;
  }>(
    '/system-info',
    {
      schema: {
        description: 'Get ORE system information (treasury and config)',
        tags: ['/connector/ore'],
        querystring: OreSystemInfoRequest,
        response: {
          200: OreSystemInfoResponse,
        },
      },
    },
    async (request) => {
      try {
        const network = request.query.network || 'mainnet-beta';
        const ore = await Ore.getInstance(network);
        return await ore.getSystemInfo();
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

export default systemInfoRoute;

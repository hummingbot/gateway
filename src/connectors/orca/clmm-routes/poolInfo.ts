import { FastifyPluginAsync } from 'fastify';

import { GetPoolInfoRequestType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { OrcaClmmGetPoolInfoRequest, OrcaPoolInfo, OrcaPoolInfoSchema } from '../schemas';

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: OrcaPoolInfo;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get pool information for a Orca pool',
        tags: ['/connector/orca'],
        querystring: OrcaClmmGetPoolInfoRequest,
        response: {
          200: OrcaPoolInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network;

        const orca = await Orca.getInstance(network);
        if (!orca) {
          throw fastify.httpErrors.serviceUnavailable('Orca service unavailable');
        }

        return (await orca.getPoolInfo(poolAddress)) as OrcaPoolInfo;
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

export default poolInfoRoute;

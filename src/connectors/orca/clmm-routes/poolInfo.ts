import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { GetPoolInfoRequestType, PoolInfo } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { OrcaClmmGetPoolInfoRequest, OrcaPoolInfo, OrcaPoolInfoSchema } from '../schemas';

export async function getPoolInfo(
  fastify: FastifyInstance,
  network: string,
  poolAddress: string,
): Promise<PoolInfo | OrcaPoolInfo> {
  const orca = await Orca.getInstance(network);
  if (!orca) {
    throw fastify.httpErrors.serviceUnavailable('Orca service unavailable');
  }

  if (!poolAddress) {
    throw fastify.httpErrors.badRequest('Pool address is required');
  }

  // Fetch pool info directly from RPC
  const poolInfo = (await orca.getPoolInfo(poolAddress)) as OrcaPoolInfo;
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  return poolInfo;
}

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
        return (await getPoolInfo(fastify, network, poolAddress)) as OrcaPoolInfo;
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

export default poolInfoRoute;

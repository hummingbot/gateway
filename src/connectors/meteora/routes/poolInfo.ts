import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { logger } from '../../../services/logger';
import { PoolInfo, PoolInfoSchema } from '../../../services/common-interfaces';

// Schema definitions
const GetPoolInfoRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  poolAddress: Type.String({ default: 'FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz' }),
});

type GetPoolInfoRequestType = Static<typeof GetPoolInfoRequest>;

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: PoolInfo;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get pool information for a Meteora pool',
        tags: ['meteora'],
        querystring: GetPoolInfoRequest,
        response: {
          200: PoolInfoSchema
        },
      }
    },
    async (request) => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network || 'mainnet-beta';
        
        const meteora = await Meteora.getInstance(network);
        if (!meteora) {
          throw fastify.httpErrors.serviceUnavailable('Meteora service unavailable');
        }
        
        return await meteora.getPoolInfo(poolAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError();
      }
    }
  );
};

export default poolInfoRoute; 
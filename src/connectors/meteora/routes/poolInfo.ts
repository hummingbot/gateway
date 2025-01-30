import { FastifyPluginAsync } from 'fastify';
import { Meteora } from '../meteora';
import { logger } from '../../../services/logger';
import { 
  PoolInfo, 
  PoolInfoSchema, 
  GetPoolInfoRequestType, 
  GetPoolInfoRequest 
} from '../../../services/clmm-interfaces';

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
        querystring: {
          ...GetPoolInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet-beta'] },
            poolAddress: { type: 'string', examples: ['FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz'] }
          }
        },
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
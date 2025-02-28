import { FastifyPluginAsync } from 'fastify';
import { Raydium } from '../raydium';
import { logger } from '../../../services/logger';
import { 
  GetPoolInfoRequestType, 
  GetPoolInfoRequest,
  PoolInfo,
  PoolInfoSchema
} from '../../../services/clmm-interfaces';

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get CLMM pool information from Raydium',
        tags: ['raydium-clmm'],
        querystring: {
          ...GetPoolInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet-beta'] },
            poolAddress: { 
              type: 'string', 
              examples: ['3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv'] 
            }
          }
        },
        response: {
          200: PoolInfoSchema
        },
      }
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network || 'mainnet-beta';
        
        const raydium = await Raydium.getInstance(network);
        const poolInfo = await raydium.getClmmPoolInfo(poolAddress);
        if (!poolInfo) throw fastify.httpErrors.notFound('Pool not found');
        return poolInfo;
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    }
  );
};

export default poolInfoRoute;
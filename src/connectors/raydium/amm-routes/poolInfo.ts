import { FastifyPluginAsync } from 'fastify';
import { Raydium } from '../raydium';
import { logger } from '../../../services/logger';
import { 
  GetPoolInfoRequestType, 
  GetPoolInfoRequest,
  PoolInfo,
  PoolInfoSchema
} from '../../../services/amm-interfaces';

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get AMM pool information from Raydium',
        tags: ['raydium-amm'],
        querystring: {
          ...GetPoolInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet-beta'] },
            poolAddress: { 
              type: 'string', 
              examples: ['AVs9TA4nWDzfPJE9gGVNJMVhcQy3V9PGazuz33BfG2RA'] 
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
        const poolInfo = await raydium.getAmmPoolInfo(poolAddress);
        if (!poolInfo) throw fastify.httpErrors.notFound('Pool not found');
        return poolInfo;
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    }
  );
};

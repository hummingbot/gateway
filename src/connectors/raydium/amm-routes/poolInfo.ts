import { FastifyPluginAsync } from 'fastify';
import { Raydium } from '../raydium';
import { logger } from '../../../services/logger';
import { 
  GetPoolInfoRequestType, 
  GetPoolInfoRequest,
  PoolInfo,
  PoolInfoSchema
} from '../../../schemas/trading-types/amm-schema';

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get AMM pool information from Raydium',
        tags: ['raydium/amm'],
        querystring: {
          ...GetPoolInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet-beta'] },
            poolAddress: { 
              type: 'string', 
              examples: ['AVs9TA4nWDzfPJE9gGVNJMVhcQy3V9PGazuz33BfG2RA'] 
            },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] }
          }
        },
        response: {
          200: PoolInfoSchema
        },
      }
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress, baseToken, quoteToken } = request.query;
        const network = request.query.network || 'mainnet-beta';
        
        const raydium = await Raydium.getInstance(network);
        
        // Check if either poolAddress or both baseToken and quoteToken are provided
        if (!poolAddress && (!baseToken || !quoteToken)) {
          throw fastify.httpErrors.badRequest(
            'Either poolAddress or both baseToken and quoteToken must be provided'
          );
        }
        
        let poolAddressToUse = poolAddress;
        
        // If no pool address provided, find default pool using base and quote tokens
        if (!poolAddressToUse) {
          poolAddressToUse = await raydium.findDefaultPool(baseToken, quoteToken, 'amm');
          if (!poolAddressToUse) {
            throw fastify.httpErrors.notFound(
              `No AMM pool found for pair ${baseToken}-${quoteToken}`
            );
          }
        }
        
        const poolInfo = await raydium.getAmmPoolInfo(poolAddressToUse);
        if (!poolInfo) throw fastify.httpErrors.notFound('Pool not found');
        return poolInfo;
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    }
  );
};

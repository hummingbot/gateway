import { FastifyPluginAsync } from 'fastify';
import { Hydration } from '../hydration';
import { logger } from '../../../services/logger';
import { 
  MeteoraPoolInfo,
  MeteoraPoolInfoSchema,
  GetPoolInfoRequestType,
  GetPoolInfoRequest 
} from '../../../services/clmm-interfaces';
import { httpNotFound } from '../../../services/error-handler';

/**
 * Route handler for getting pool information
 */
export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/pool-info',
    {
      schema: {
        description: 'Get pool information for a Hydration pool',
        tags: ['hydration'],
        querystring: {
          ...GetPoolInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet'] },
            poolAddress: { type: 'string', examples: ['hydration-pool-0'] }
          }
        },
        response: {
          200: MeteoraPoolInfoSchema
        },
      }
    },
    async (request) => {
      try {
        const { poolAddress } = request.query as GetPoolInfoRequestType;
        const network = (request.query as GetPoolInfoRequestType).network || 'mainnet';
        
        const hydration = await Hydration.getInstance(network);
        if (!hydration) {
          throw fastify.httpErrors.serviceUnavailable('Hydration service unavailable');
        }
        
        const poolInfo = await hydration.getPoolInfo(poolAddress);
        if (!poolInfo) {
          throw httpNotFound(`Pool not found: ${poolAddress}`);
        }

        const liquidityBins = await hydration.getPoolLiquidity(poolAddress);
        
        // Map Hydration pool info to the interface expected by the client
        return {
          poolAddress: poolInfo.poolAddress,
          baseToken: {
            symbol: poolInfo.baseToken.symbol,
            address: poolInfo.baseToken.address,
            decimals: poolInfo.baseToken.decimals,
            name: poolInfo.baseToken.name
          },
          quoteToken: {
            symbol: poolInfo.quoteToken.symbol,
            address: poolInfo.quoteToken.address,
            decimals: poolInfo.quoteToken.decimals,
            name: poolInfo.quoteToken.name
          },
          fee: poolInfo.fee,
          liquidity: poolInfo.liquidity,
          sqrtPrice: poolInfo.sqrtPrice,
          tick: poolInfo.tick,
          price: poolInfo.price,
          volume24h: poolInfo.volume24h,
          volumeWeek: poolInfo.volumeWeek,
          tvl: poolInfo.tvl,
          bins: liquidityBins.map(bin => ({
            lowerPrice: bin.lowerPrice,
            upperPrice: bin.upperPrice,
            liquidityAmount: bin.liquidityAmount,
            baseTokenAmount: bin.baseTokenAmount,
            quoteTokenAmount: bin.quoteTokenAmount
          })),
          apr: poolInfo.apr
        };
      } catch (e) {
        logger.error('Error in pool-info:', e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default poolInfoRoute;


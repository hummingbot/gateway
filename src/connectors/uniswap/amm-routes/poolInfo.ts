import { FastifyPluginAsync } from 'fastify';
import { Uniswap } from '../uniswap';
import { logger } from '../../../services/logger';
import { 
  GetPoolInfoRequestType, 
  GetPoolInfoRequest,
  PoolInfo,
  PoolInfoSchema
} from '../../../schemas/trading-types/amm-schema';
import { formatTokenAmount } from '../uniswap.utils';

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get AMM pool information from Uniswap V2',
        tags: ['uniswap/amm'],
        querystring: {
          ...GetPoolInfoRequest,
          properties: {
            network: { type: 'string', examples: ['base'], default: 'base' },
            chain: { type: 'string', examples: ['ethereum'], default: 'ethereum' },
            poolAddress: { 
              type: 'string', 
              examples: ['0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc'] 
            },
            baseToken: { type: 'string', examples: ['WETH'] },
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
        const network = request.query.network || 'base';
        
        const uniswap = await Uniswap.getInstance(network);
        
        // Check if either poolAddress or both baseToken and quoteToken are provided
        if (!poolAddress && (!baseToken || !quoteToken)) {
          throw fastify.httpErrors.badRequest(
            'Either poolAddress or both baseToken and quoteToken must be provided'
          );
        }
        
        let poolAddressToUse = poolAddress;
        
        // If no pool address provided, find default pool using base and quote tokens
        if (!poolAddressToUse) {
          poolAddressToUse = await uniswap.findDefaultPool(baseToken, quoteToken, 'amm');
          if (!poolAddressToUse) {
            throw fastify.httpErrors.notFound(
              `No AMM pool found for pair ${baseToken}-${quoteToken}`
            );
          }
        }
        
        // Get V2 pair data
        const baseTokenObj = baseToken ? uniswap.getTokenBySymbol(baseToken) : null;
        const quoteTokenObj = quoteToken ? uniswap.getTokenBySymbol(quoteToken) : null;
        
        const v2Pair = await uniswap.getV2Pool(
          baseTokenObj || '', 
          quoteTokenObj || '', 
          poolAddressToUse
        );
        
        if (!v2Pair) {
          throw fastify.httpErrors.notFound('Pool not found');
        }
        
        // Get the tokens from the pair
        const token0 = v2Pair.token0;
        const token1 = v2Pair.token1;
        
        // Determine which token is base and which is quote
        let actualBaseToken, actualQuoteToken;
        let baseTokenAmount, quoteTokenAmount;
        
        if (baseTokenObj && (token0.address === baseTokenObj.address)) {
          actualBaseToken = token0;
          actualQuoteToken = token1;
          baseTokenAmount = formatTokenAmount(v2Pair.reserve0.quotient.toString(), token0.decimals);
          quoteTokenAmount = formatTokenAmount(v2Pair.reserve1.quotient.toString(), token1.decimals);
        } else {
          actualBaseToken = token1;
          actualQuoteToken = token0;
          baseTokenAmount = formatTokenAmount(v2Pair.reserve1.quotient.toString(), token1.decimals);
          quoteTokenAmount = formatTokenAmount(v2Pair.reserve0.quotient.toString(), token0.decimals);
        }
        
        // Calculate price (quoteToken per baseToken)
        const price = quoteTokenAmount / baseTokenAmount;
        
        return {
          address: poolAddressToUse,
          baseTokenAddress: actualBaseToken.address,
          quoteTokenAddress: actualQuoteToken.address,
          feePct: 0.3, // Uniswap V2 fee is fixed at 0.3%
          price: price,
          baseTokenAmount: baseTokenAmount,
          quoteTokenAmount: quoteTokenAmount,
          poolType: 'amm',
          lpMint: {
            address: poolAddressToUse, // In Uniswap V2, the LP token address is the pair address
            decimals: 18 // Uniswap V2 LP tokens have 18 decimals
          }
        };
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    }
  );
};

export default poolInfoRoute;
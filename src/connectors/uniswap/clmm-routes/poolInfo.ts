import { FastifyPluginAsync } from 'fastify';
import { Uniswap } from '../uniswap';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { logger } from '../../../services/logger';
import { 
  GetPoolInfoRequestType, 
  GetPoolInfoRequest,
  PoolInfo,
  PoolInfoSchema
} from '../../../schemas/trading-types/clmm-schema';
import { formatTokenAmount } from '../uniswap.utils';
import { FeeAmount } from '@uniswap/v3-sdk';

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get CLMM pool information from Uniswap V3',
        tags: ['uniswap/clmm'],
        querystring: {
          ...GetPoolInfoRequest,
          properties: {
            network: { type: 'string', default: 'base' },
            poolAddress: { 
              type: 'string', 
              examples: [''] 
            },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            feeTier: { type: 'string', enum: ['LOWEST', 'LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' }
          }
        },
        response: {
          200: PoolInfoSchema
        },
      }
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress, baseToken, quoteToken, feeTier } = request.query;
        const network = request.query.network || 'base';
        const chain = 'ethereum'; // Default to ethereum
        
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
          // Convert feeTier string to FeeAmount if provided
          let feeAmount: FeeAmount | undefined;
          if (feeTier) {
            switch (feeTier.toUpperCase()) {
              case 'LOWEST':
                feeAmount = FeeAmount.LOWEST;
                break;
              case 'LOW':
                feeAmount = FeeAmount.LOW;
                break;
              case 'MEDIUM':
                feeAmount = FeeAmount.MEDIUM;
                break;
              case 'HIGH':
                feeAmount = FeeAmount.HIGH;
                break;
              default:
                feeAmount = FeeAmount.MEDIUM;
            }
          }
          
          // Find pool using tokens and optional fee amount
          poolAddressToUse = await uniswap.findDefaultPool(baseToken, quoteToken, 'clmm');
          if (!poolAddressToUse) {
            throw fastify.httpErrors.notFound(
              `No CLMM pool found for pair ${baseToken}-${quoteToken}`
            );
          }
        }
        
        // Get base and quote token objects
        const baseTokenObj = baseToken ? uniswap.getTokenBySymbol(baseToken) : null;
        const quoteTokenObj = quoteToken ? uniswap.getTokenBySymbol(quoteToken) : null;
        
        // Get V3 pool details
        const pool = await uniswap.getV3Pool(
          baseTokenObj || '',
          quoteTokenObj || '',
          undefined,
          poolAddressToUse
        );
        
        if (!pool) {
          throw fastify.httpErrors.notFound('Pool not found');
        }
        
        // Get token amounts from pool liquidity
        const sqrt = BigInt(pool.sqrtRatioX96.toString());
        const q96 = BigInt(2) ** BigInt(96);
        const price = Number((sqrt * sqrt) / q96) / (2 ** 96);
        
        // Calculate token amounts based on liquidity and current price
        const liquidity = BigInt(pool.liquidity.toString());
        const sqrtPriceX96 = BigInt(pool.sqrtRatioX96.toString());
        
        // Calculate token amounts (simplified approximation)
        const baseTokenAmount = Number(liquidity * q96 / sqrtPriceX96 / BigInt(10 ** baseTokenObj.decimals));
        const quoteTokenAmount = Number(liquidity * sqrtPriceX96 / q96 / BigInt(10 ** quoteTokenObj.decimals));
        
        // Convert fee percentage (fee is stored as a fixed point number in parts per million)
        const feePct = pool.fee / 10000;
        
        // Get bin step (ticks in Uniswap V3 terms)
        const tickSpacing = pool.tickSpacing;
        
        // Get active tick/bin
        const activeBinId = pool.tickCurrent;
        
        return {
          address: poolAddressToUse,
          baseTokenAddress: baseTokenObj.address,
          quoteTokenAddress: quoteTokenObj.address,
          binStep: tickSpacing,
          feePct: feePct,
          price: price,
          baseTokenAmount: baseTokenAmount,
          quoteTokenAmount: quoteTokenAmount,
          activeBinId: activeBinId
        };
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    }
  );
};

export default poolInfoRoute;
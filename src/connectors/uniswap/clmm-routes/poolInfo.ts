import { FeeAmount } from '@uniswap/v3-sdk';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  GetPoolInfoRequestType,
  GetPoolInfoRequest,
  PoolInfo,
  PoolInfoSchema,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { formatTokenAmount } from '../uniswap.utils';

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
              examples: [''],
            },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
          },
        },
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress, baseToken, quoteToken } = request.query;
        const network = request.query.network || 'base';
        const chain = 'ethereum'; // Default to ethereum

        const uniswap = await Uniswap.getInstance(network);

        // Check if either poolAddress or both baseToken and quoteToken are provided
        if (!poolAddress && (!baseToken || !quoteToken)) {
          throw fastify.httpErrors.badRequest(
            'Either poolAddress or both baseToken and quoteToken must be provided',
          );
        }

        let poolAddressToUse = poolAddress;

        // If no pool address provided, find default pool using base and quote tokens
        if (!poolAddressToUse) {
          // Find pool using tokens
          poolAddressToUse = await uniswap.findDefaultPool(
            baseToken,
            quoteToken,
            'clmm',
          );
          if (!poolAddressToUse) {
            throw fastify.httpErrors.notFound(
              `No CLMM pool found for pair ${baseToken}-${quoteToken}`,
            );
          }
        }

        // Get base and quote token objects
        const baseTokenObj = baseToken
          ? uniswap.getTokenBySymbol(baseToken)
          : null;
        const quoteTokenObj = quoteToken
          ? uniswap.getTokenBySymbol(quoteToken)
          : null;

        // Get V3 pool details - using null coalescing with type assertion to handle type checking
        const pool = await uniswap.getV3Pool(
          baseTokenObj || (baseTokenObj as any),
          quoteTokenObj || (quoteTokenObj as any),
          undefined,
          poolAddressToUse,
        );

        if (!pool) {
          throw fastify.httpErrors.notFound('Pool not found');
        }

        // Determine token ordering
        const token0 = pool.token0;
        const token1 = pool.token1;
        const isBaseToken0 = baseTokenObj.address.toLowerCase() === token0.address.toLowerCase();
        
        // Calculate price based on sqrtPriceX96
        // sqrtPriceX96 = sqrt(price) * 2^96
        // price = (sqrtPriceX96 / 2^96)^2
        const sqrtPriceX96 = pool.sqrtRatioX96;
        const price0 = pool.token0Price.toSignificant(15);
        const price1 = pool.token1Price.toSignificant(15);
        
        // Get the price of base token in terms of quote token
        const price = isBaseToken0 ? parseFloat(price0) : parseFloat(price1);

        // Get token reserves in the pool
        // This is a simplified calculation - actual reserves depend on the tick distribution
        const liquidity = pool.liquidity;
        const token0Amount = formatTokenAmount(
          liquidity.toString(),
          token0.decimals
        );
        const token1Amount = formatTokenAmount(
          liquidity.toString(), 
          token1.decimals
        );
        
        // Map to base and quote amounts
        const baseTokenAmount = isBaseToken0 ? token0Amount : token1Amount;
        const quoteTokenAmount = isBaseToken0 ? token1Amount : token0Amount;

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
          activeBinId: activeBinId,
        };
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError(
          'Failed to fetch pool info',
        );
      }
    },
  );
};

export default poolInfoRoute;

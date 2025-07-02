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
import { formatTokenAmount, getUniswapPoolInfo } from '../uniswap.utils';

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
        const { poolAddress } = request.query;
        const network = request.query.network || 'base';
        const chain = 'ethereum'; // Default to ethereum

        const uniswap = await Uniswap.getInstance(network);

        // Pool address is required
        if (!poolAddress) {
          throw fastify.httpErrors.badRequest('Pool address is required');
        }

        // Get pool information to determine tokens
        const poolInfo = await getUniswapPoolInfo(poolAddress, network, 'clmm');
        if (!poolInfo) {
          throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
        }

        const baseTokenObj = uniswap.getTokenByAddress(
          poolInfo.baseTokenAddress,
        );
        const quoteTokenObj = uniswap.getTokenByAddress(
          poolInfo.quoteTokenAddress,
        );

        if (!baseTokenObj || !quoteTokenObj) {
          throw fastify.httpErrors.badRequest(
            'Token information not found for pool',
          );
        }

        // Get V3 pool details
        const pool = await uniswap.getV3Pool(
          baseTokenObj,
          quoteTokenObj,
          undefined,
          poolAddress,
        );

        if (!pool) {
          throw fastify.httpErrors.notFound('Pool not found');
        }

        // Determine token ordering
        const token0 = pool.token0;
        const token1 = pool.token1;
        const isBaseToken0 =
          baseTokenObj.address.toLowerCase() === token0.address.toLowerCase();

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
          token0.decimals,
        );
        const token1Amount = formatTokenAmount(
          liquidity.toString(),
          token1.decimals,
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
          address: poolAddress,
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

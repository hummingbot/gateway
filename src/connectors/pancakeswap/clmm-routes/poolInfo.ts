import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import JSBI from 'jsbi';

import { GetPoolInfoRequestType, PoolInfo, PoolInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { computeUniswapBinDistribution } from '../../uniswap/uniswap.utils';
import { Pancakeswap } from '../pancakeswap';
import { formatTokenAmount, getPancakeswapPoolInfo } from '../pancakeswap.utils';
import { PancakeswapClmmGetPoolInfoRequest } from '../schemas';

export async function getPoolInfo(
  fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  binCount: number = 0,
): Promise<PoolInfo> {
  const pancakeswap = await Pancakeswap.getInstance(network);

  if (!poolAddress) {
    throw fastify.httpErrors.badRequest('Pool address is required');
  }

  const poolInfo = await getPancakeswapPoolInfo(poolAddress, network, 'clmm');
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
  }

  const baseTokenObj = await pancakeswap.getToken(poolInfo.baseTokenAddress);
  const quoteTokenObj = await pancakeswap.getToken(poolInfo.quoteTokenAddress);

  if (!baseTokenObj || !quoteTokenObj) {
    throw fastify.httpErrors.badRequest('Token information not found for pool');
  }

  const pool = await pancakeswap.getV3Pool(baseTokenObj, quoteTokenObj, undefined, poolAddress);

  if (!pool) {
    throw fastify.httpErrors.notFound('Pool not found');
  }

  const token0 = pool.token0;
  const token1 = pool.token1;
  const isBaseToken0 = baseTokenObj.address.toLowerCase() === token0.address.toLowerCase();

  const price0 = pool.token0Price.toSignificant(15);
  const price1 = pool.token1Price.toSignificant(15);

  const price = isBaseToken0 ? parseFloat(price0) : parseFloat(price1);

  const liquidity = pool.liquidity;
  const token0Amount = formatTokenAmount(liquidity.toString(), token0.decimals);
  const token1Amount = formatTokenAmount(liquidity.toString(), token1.decimals);

  const baseTokenAmount = isBaseToken0 ? token0Amount : token1Amount;
  const quoteTokenAmount = isBaseToken0 ? token1Amount : token0Amount;

  const feePct = pool.fee / 10000;
  const tickSpacing = pool.tickSpacing;
  const activeBinId = pool.tickCurrent;

  const result: PoolInfo = {
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

  if (binCount > 0) {
    result.bins = await computeUniswapBinDistribution({
      poolAddress,
      network,
      tickSpacing,
      currentTick: activeBinId,
      sqrtPriceX96: JSBI.BigInt(pool.sqrtRatioX96.toString()),
      decimalsBase: baseTokenObj.decimals,
      decimalsQuote: quoteTokenObj.decimals,
      isBaseToken0,
      binCount,
    });
  }

  return result;
}

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get CLMM pool information from Pancakeswap V3',
        tags: ['/connector/pancakeswap'],
        querystring: PancakeswapClmmGetPoolInfoRequest,
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress, binCount = 0 } = request.query;
        const network = request.query.network;
        return await getPoolInfo(fastify, network, poolAddress, binCount);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    },
  );
};

export default poolInfoRoute;

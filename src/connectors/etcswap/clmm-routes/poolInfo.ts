import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { GetPoolInfoRequestType, PoolInfo, PoolInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { ETCswap } from '../etcswap';
import { isV3Available } from '../etcswap.contracts';
import { formatTokenAmount, getETCswapPoolInfo } from '../etcswap.utils';
import { ETCswapClmmGetPoolInfoRequest } from '../schemas';

export async function getPoolInfo(fastify: FastifyInstance, network: string, poolAddress: string): Promise<PoolInfo> {
  // Check if V3 is available on this network
  if (!isV3Available(network)) {
    throw fastify.httpErrors.badRequest(`ETCswap V3 (CLMM) is not available on network: ${network}`);
  }

  const etcswap = await ETCswap.getInstance(network);

  if (!poolAddress) {
    throw fastify.httpErrors.badRequest('Pool address is required');
  }

  // Get pool information to determine tokens
  const poolInfo = await getETCswapPoolInfo(poolAddress, network, 'clmm');
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
  }

  const baseTokenObj = await etcswap.getToken(poolInfo.baseTokenAddress);
  const quoteTokenObj = await etcswap.getToken(poolInfo.quoteTokenAddress);

  if (!baseTokenObj || !quoteTokenObj) {
    throw fastify.httpErrors.badRequest('Token information not found for pool');
  }

  // Get V3 pool details
  const pool = await etcswap.getV3Pool(baseTokenObj, quoteTokenObj, undefined, poolAddress);

  if (!pool) {
    throw fastify.httpErrors.notFound('Pool not found');
  }

  // Determine token ordering
  const token0 = pool.token0;
  const token1 = pool.token1;
  const isBaseToken0 = baseTokenObj.address.toLowerCase() === token0.address.toLowerCase();

  // Calculate price based on sqrtPriceX96
  const price0 = pool.token0Price.toSignificant(15);
  const price1 = pool.token1Price.toSignificant(15);

  // Get the price of base token in terms of quote token
  const price = isBaseToken0 ? parseFloat(price0) : parseFloat(price1);

  // Get token reserves in the pool
  const liquidity = pool.liquidity;
  const token0Amount = formatTokenAmount(liquidity.toString(), token0.decimals);
  const token1Amount = formatTokenAmount(liquidity.toString(), token1.decimals);

  // Map to base and quote amounts
  const baseTokenAmount = isBaseToken0 ? token0Amount : token1Amount;
  const quoteTokenAmount = isBaseToken0 ? token1Amount : token0Amount;

  // Convert fee percentage
  const feePct = pool.fee / 10000;

  // Get tick spacing
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
}

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get CLMM pool information from ETCswap V3',
        tags: ['/connector/etcswap'],
        querystring: ETCswapClmmGetPoolInfoRequest,
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network || 'classic';
        return await getPoolInfo(fastify, network, poolAddress);
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

import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { GetPoolInfoRequestType, PoolInfo, PoolInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import { computeBinDistribution } from '../pancakeswap-sol.bins';
import { PancakeswapSolClmmGetPoolInfoRequest } from '../schemas';

export async function getPoolInfo(
  fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  binCount: number = 0,
): Promise<PoolInfo> {
  const pancakeswap = await PancakeswapSol.getInstance(network);

  if (!poolAddress) {
    throw fastify.httpErrors.badRequest('Pool address is required');
  }

  // Fetch pool info directly from RPC
  const poolInfo = await pancakeswap.getClmmPoolInfo(poolAddress);
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  // Optionally include the per-bin distribution around the current tick — only
  // fires the extra tick-array fetch when binCount > 0 so default latency is
  // unchanged (same contract as orca/raydium).
  if (binCount > 0) {
    const solana = await Solana.getInstance(network);
    poolInfo.bins = await computeBinDistribution({
      connection: solana.connection,
      poolAddress,
      tickSpacing: poolInfo.binStep as number,
      currentTick: poolInfo.activeBinId as number,
      currentPrice: poolInfo.price,
      liquidity: (poolInfo as any)._liquidity as bigint,
      decimals0: (poolInfo as any)._mintDecimals0 as number,
      decimals1: (poolInfo as any)._mintDecimals1 as number,
      binCount,
    });
  }

  return poolInfo;
}

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: PoolInfo;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get CLMM pool information from PancakeSwap Solana',
        tags: ['/connector/pancakeswap-sol'],
        querystring: PancakeswapSolClmmGetPoolInfoRequest,
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { network = 'mainnet-beta', poolAddress, binCount = 0 } = request.query;
        return await getPoolInfo(fastify, network, poolAddress, binCount);
      } catch (e: any) {
        logger.error('Pool info error:', e);
        // Re-throw httpErrors as-is
        if (e.statusCode) {
          throw e;
        }
        // Handle unknown errors
        const errorMessage = e.message || 'Failed to fetch pool info';
        throw fastify.httpErrors.internalServerError(errorMessage);
      }
    },
  );
};

export default poolInfoRoute;

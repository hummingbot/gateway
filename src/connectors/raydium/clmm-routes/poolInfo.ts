import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { PoolInfo, PoolInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { computeRaydiumBinDistribution } from '../raydium.utils';
import { RaydiumClmmGetPoolInfoRequest, RaydiumClmmGetPoolInfoRequestType } from '../schemas';

export async function getPoolInfo(
  fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  binCount: number = 0,
): Promise<PoolInfo> {
  const raydium = await Raydium.getInstance(network);

  if (!poolAddress) {
    throw fastify.httpErrors.badRequest('Pool address is required');
  }

  // Fetch pool info directly from RPC
  const poolInfo = await raydium.getClmmPoolInfo(poolAddress);
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  // Optionally include the per-bin liquidity distribution around the current
  // tick. Fires an extra getProgramAccounts call (via the SDK's
  // fetchMultiplePoolTickArrays) — only when binCount > 0 so default
  // pool-info latency is unaffected.
  if (binCount > 0) {
    try {
      const rawPool = await raydium.getClmmPoolfromRPC(poolAddress);
      const apiResult = await raydium.getClmmPoolfromAPI(poolAddress);
      if (rawPool && apiResult) {
        const [apiPoolInfo, poolKeys] = apiResult;
        const solana = await Solana.getInstance(network);
        const result = poolInfo as PoolInfo;
        result.bins = await computeRaydiumBinDistribution({
          connection: solana.connection,
          poolInfo: apiPoolInfo,
          poolKeys,
          tickSpacing: Number(rawPool.tickSpacing),
          currentTick: Number(rawPool.tickCurrent),
          currentSqrtPriceX64: rawPool.sqrtPriceX64,
          activeLiquidity: rawPool.liquidity,
          decimalsA: apiPoolInfo.mintA.decimals,
          decimalsB: apiPoolInfo.mintB.decimals,
          binCount,
        });
      }
    } catch (e) {
      logger.warn(`Raydium bin distribution fetch failed for ${poolAddress}: ${e}`);
    }
  }

  return poolInfo;
}

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: RaydiumClmmGetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get CLMM pool information from Raydium',
        tags: ['/connector/raydium'],
        querystring: RaydiumClmmGetPoolInfoRequest,
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress, binCount = 0, network } = request.query;
        return await getPoolInfo(fastify, network, poolAddress, binCount);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    },
  );
};

export default poolInfoRoute;

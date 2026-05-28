import BN from 'bn.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { GetPoolInfoRequestType, PoolInfo, PoolInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { computeRaydiumBinDistribution } from '../raydium.utils';
import { RaydiumClmmGetPoolInfoRequest } from '../schemas';

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

  if (binCount > 0) {
    try {
      const apiResult = await raydium.getClmmPoolfromAPI(poolAddress);
      const rawPool = await raydium.getClmmPoolfromRPC(poolAddress);
      if (apiResult && rawPool) {
        const [apiPoolInfo, poolKeys] = apiResult;
        const solana = await Solana.getInstance(network);
        poolInfo.bins = await computeRaydiumBinDistribution({
          connection: solana.connection,
          poolInfo: apiPoolInfo,
          poolKeys,
          tickSpacing: Number(rawPool.tickSpacing),
          currentTick: Number(rawPool.tickCurrent),
          currentSqrtPriceX64: new BN(rawPool.sqrtPriceX64.toString()),
          activeLiquidity: new BN(rawPool.liquidity.toString()),
          decimalsA: rawPool.mintDecimalsA,
          decimalsB: rawPool.mintDecimalsB,
          binCount,
        });
      }
    } catch (e) {
      logger.warn(`Failed to compute bin distribution for ${poolAddress}: ${e}`);
    }
  }

  return poolInfo;
}

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
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
        const { poolAddress, binCount = 0 } = request.query;
        const network = request.query.network;
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

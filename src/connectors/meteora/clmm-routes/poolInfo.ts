import { FastifyInstance } from 'fastify';

import { MeteoraPoolInfo, PoolInfo } from '../../../schemas/clmm-schema';
import { Meteora } from '../meteora';

export async function getPoolInfo(
  fastify: FastifyInstance,
  network: string,
  poolAddress: string,
): Promise<PoolInfo | MeteoraPoolInfo> {
  const meteora = await Meteora.getInstance(network);
  if (!meteora) {
    throw fastify.httpErrors.serviceUnavailable('Meteora service unavailable');
  }

  if (!poolAddress) {
    throw fastify.httpErrors.badRequest('Pool address is required');
  }

  // Fetch pool info directly from RPC (always includes bins)
  const poolInfo = (await meteora.getPoolInfo(poolAddress)) as MeteoraPoolInfo;
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  return poolInfo;
}

import { FastifyInstance } from 'fastify';

import { PositionInfo } from '../../../schemas/clmm-schema';
import { PancakeswapSol } from '../pancakeswap-sol';

export async function getPositionInfo(
  fastify: FastifyInstance,
  network: string,
  positionAddress: string,
): Promise<PositionInfo> {
  const pancakeswap = await PancakeswapSol.getInstance(network);

  if (!positionAddress) {
    throw fastify.httpErrors.badRequest('Position address is required');
  }

  const positionInfo = await pancakeswap.getPositionInfo(positionAddress);
  if (!positionInfo) {
    throw fastify.httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  return positionInfo;
}

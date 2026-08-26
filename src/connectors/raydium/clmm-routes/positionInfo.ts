import { FastifyInstance } from 'fastify';

import { PositionInfo } from '../../../schemas/clmm-schema';
import { Raydium } from '../raydium';

export async function getPositionInfo(
  fastify: FastifyInstance,
  network: string,
  positionAddress: string,
): Promise<PositionInfo> {
  const raydium = await Raydium.getInstance(network);

  if (!positionAddress) {
    throw fastify.httpErrors.badRequest('Position address is required');
  }

  // Fetch position info directly from RPC
  const positionInfo = await raydium.getPositionInfo(positionAddress);
  if (!positionInfo) {
    throw fastify.httpErrors.notFound(`Position not found or closed: ${positionAddress}`);
  }

  return positionInfo;
}

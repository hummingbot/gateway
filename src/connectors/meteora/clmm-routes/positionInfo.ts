import { FastifyInstance } from 'fastify';

import { PositionInfo } from '../../../schemas/clmm-schema';
import { Meteora } from '../meteora';

export async function getPositionInfo(
  fastify: FastifyInstance,
  network: string,
  positionAddress: string,
): Promise<PositionInfo> {
  const meteora = await Meteora.getInstance(network);

  if (!positionAddress) {
    throw fastify.httpErrors.badRequest('Position address is required');
  }

  const positionInfo = await meteora.getPositionInfoByAddress(positionAddress);
  if (!positionInfo) {
    throw fastify.httpErrors.notFound(`Position not found or closed: ${positionAddress}`);
  }
  return positionInfo;
}

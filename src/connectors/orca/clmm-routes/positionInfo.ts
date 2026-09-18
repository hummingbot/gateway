import { PublicKey } from '@solana/web3.js';
import { FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { PositionInfo } from '../../../schemas/clmm-schema';
import { Orca } from '../orca';

export async function getPositionInfo(
  fastify: FastifyInstance,
  network: string,
  positionAddress: string,
  walletAddress?: string,
): Promise<PositionInfo> {
  const orca = await Orca.getInstance(network);

  if (!positionAddress) {
    throw fastify.httpErrors.badRequest('Position address is required');
  }

  // Get wallet address from Solana class if not provided
  let resolvedWalletAddress = walletAddress;
  if (!resolvedWalletAddress) {
    resolvedWalletAddress = await Solana.getWalletAddressExample();
  }

  // Validate wallet address
  if (resolvedWalletAddress) {
    try {
      new PublicKey(resolvedWalletAddress);
    } catch (error) {
      throw fastify.httpErrors.badRequest(`Invalid wallet address: ${resolvedWalletAddress}`);
    }
  }

  const positionInfo = await orca.getPositionInfo(positionAddress, resolvedWalletAddress);
  if (!positionInfo) {
    throw fastify.httpErrors.notFound(`Position not found or closed: ${positionAddress}`);
  }

  return positionInfo;
}

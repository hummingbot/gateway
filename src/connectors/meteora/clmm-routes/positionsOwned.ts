import { PublicKey } from '@solana/web3.js';
import { FastifyInstance } from 'fastify';

import { PositionInfo } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';

// Using Fastify's native error handling
const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) => `Invalid Solana address: ${address}`;

export async function getPositionsOwned(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
): Promise<PositionInfo[]> {
  // Validate wallet address
  try {
    new PublicKey(walletAddress);
  } catch {
    throw fastify.httpErrors.badRequest(`Invalid wallet address: ${walletAddress}`);
  }

  // Fetch from RPC (positions are cached individually by position address, not by wallet)
  const positions = await fetchPositionsFromRPC(network, walletAddress);

  return positions;
}

/**
 * Fetch positions from RPC
 */
async function fetchPositionsFromRPC(network: string, walletAddress: string): Promise<PositionInfo[]> {
  const meteora = await Meteora.getInstance(network);

  logger.info(`Fetching all positions for wallet ${walletAddress}`);

  const positions = await meteora.getAllPositionsForWallet(new PublicKey(walletAddress));

  logger.info(`Found ${positions.length} Meteora position(s) for wallet ${walletAddress.slice(0, 8)}...`);
  return positions;
}

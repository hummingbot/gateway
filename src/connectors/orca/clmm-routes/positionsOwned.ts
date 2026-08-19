import { PublicKey } from '@solana/web3.js';
import { FastifyInstance } from 'fastify';

import { getSolanaChainConfig } from '../../../chains/solana/solana.config';
import { PositionInfo } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';

const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) => `Invalid Solana address: ${address}`;

export async function getPositionsOwned(
  fastify: FastifyInstance,
  network: string,
  walletAddress?: string,
): Promise<PositionInfo[]> {
  const orca = await Orca.getInstance(network);

  // Get wallet address - use provided or default
  const walletAddressToUse = walletAddress || getSolanaChainConfig().defaultWallet;

  // Validate wallet address
  try {
    new PublicKey(walletAddressToUse);
  } catch {
    throw fastify.httpErrors.badRequest(`Invalid wallet address: ${walletAddressToUse}`);
  }

  logger.info(`Fetching all Orca positions for wallet ${walletAddressToUse.slice(0, 8)}...`);

  const positions = await orca.getPositionsForWalletAddress(walletAddressToUse);

  logger.info(`Found ${positions.length} Orca position(s) for wallet ${walletAddressToUse.slice(0, 8)}...`);
  return positions;
}

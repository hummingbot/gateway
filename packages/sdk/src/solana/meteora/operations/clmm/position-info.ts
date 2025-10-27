/**
 * Meteora Position Info Operation
 *
 * Gets detailed information about a specific position.
 */

import { PublicKey } from '@solana/web3.js';

import { PositionInfoParams, PositionInfoResult } from '../../types';

/**
 * Get position information
 *
 * This is a query operation (read-only).
 * Returns detailed information about a specific position.
 *
 * @param meteora Meteora connector instance
 * @param solana Solana chain instance
 * @param params Position info parameters
 * @returns Position information
 */
export async function getPositionInfo(
  meteora: any, // Meteora connector
  solana: any,  // Solana chain
  params: PositionInfoParams,
): Promise<PositionInfoResult> {
  const { positionAddress, walletAddress } = params;

  // Need wallet to query position
  if (!walletAddress) {
    throw new Error('Wallet address is required to query position info');
  }

  const wallet = await solana.getWallet(walletAddress);
  const walletPubkey = new PublicKey(wallet.publicKey);

  const positionInfo = await meteora.getPositionInfo(positionAddress, walletPubkey);

  if (!positionInfo) {
    throw new Error(`Position not found: ${positionAddress}`);
  }

  return positionInfo;
}

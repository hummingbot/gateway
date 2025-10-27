/**
 * Meteora Positions Owned Operation
 *
 * Gets all positions owned by a wallet, optionally filtered by pool.
 */

import { PublicKey } from '@solana/web3.js';

import { PositionsOwnedParams, PositionsOwnedResult, PositionSummary } from '../../types';

/**
 * Get positions owned by wallet
 *
 * This is a query operation (read-only).
 * Returns all positions for a wallet, optionally filtered to a specific pool.
 *
 * @param meteora Meteora connector instance
 * @param solana Solana chain instance
 * @param params Positions owned parameters
 * @returns List of position summaries
 */
export async function getPositionsOwned(
  meteora: any, // Meteora connector
  solana: any,  // Solana chain
  params: PositionsOwnedParams,
): Promise<PositionsOwnedResult> {
  const { walletAddress, poolAddress } = params;

  const wallet = await solana.getWallet(walletAddress);
  const walletPubkey = new PublicKey(wallet.publicKey);

  let positions: PositionSummary[];

  if (poolAddress) {
    // Get positions for specific pool
    const poolPositions = await meteora.getPositionsInPool(poolAddress, walletPubkey);

    positions = poolPositions.map((pos: any) => ({
      address: pos.address,
      poolAddress: pos.poolAddress,
      lowerBinId: pos.lowerBinId,
      upperBinId: pos.upperBinId,
    }));
  } else {
    // Get all positions across all pools
    const DLMM = require('@meteora-ag/dlmm').default;
    const allPositions = await DLMM.getAllLbPairPositionsByUser(
      solana.connection,
      walletPubkey,
    );

    positions = [];
    for (const [_poolKey, poolData] of allPositions) {
      for (const position of poolData.lbPairPositionsData) {
        positions.push({
          address: position.publicKey.toBase58(),
          poolAddress: poolData.publicKey.toBase58(),
          lowerBinId: position.positionData.lowerBinId,
          upperBinId: position.positionData.upperBinId,
        });
      }
    }
  }

  return { positions };
}

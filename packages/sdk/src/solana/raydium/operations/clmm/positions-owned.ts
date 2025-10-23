/**
 * Raydium CLMM Positions Owned Query
 *
 * Query operation to fetch all positions owned by a wallet in a specific pool.
 * Retrieves the list of positions with full details.
 */

import { PublicKey } from '@solana/web3.js';
import { PositionsOwnedParams, PositionsOwnedResult } from '../../types/clmm';

/**
 * Get Positions Owned by Wallet in Pool
 *
 * Fetches all positions owned by a wallet in a specific CLMM pool:
 * - Gets all positions for the program
 * - Filters by specific pool address
 * - Returns full position details for each
 *
 * @param raydium - Raydium connector instance
 * @param params - Positions owned parameters
 * @returns Array of position information
 */
export async function getPositionsOwned(
  raydium: any, // Will be properly typed as RaydiumConnector
  params: PositionsOwnedParams,
): Promise<PositionsOwnedResult> {
  // Validate addresses
  try {
    new PublicKey(params.poolAddress);
  } catch (error) {
    throw new Error('Invalid pool address');
  }

  try {
    new PublicKey(params.walletAddress);
  } catch (error) {
    throw new Error('Invalid wallet address');
  }

  // Prepare wallet and set owner
  const { wallet } = await raydium.prepareWallet(params.walletAddress);
  await raydium.setOwner(wallet);

  // Get pool info to extract program ID
  const apiResponse = await raydium.getClmmPoolfromAPI(params.poolAddress);

  if (!apiResponse) {
    throw new Error(`Pool not found for address: ${params.poolAddress}`);
  }

  const poolInfo = apiResponse[0];

  // Get all positions owned by the wallet for this program
  const positions = await raydium.raydiumSDK.clmm.getOwnerPositionInfo({
    programId: poolInfo.programId,
  });

  // Filter positions for this specific pool and fetch full details
  const poolPositions: PositionsOwnedResult = [];
  for (const pos of positions) {
    const positionInfo = await raydium.getPositionInfo(pos.nftMint.toString());
    if (positionInfo && positionInfo.poolAddress === params.poolAddress) {
      poolPositions.push(positionInfo);
    }
  }

  return poolPositions;
}

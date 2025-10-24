/**
 * Raydium CLMM Pool Info Query
 *
 * Simple query operation to fetch CLMM pool information.
 * No transaction building required - pure data fetch.
 */

import { PoolInfoParams, PoolInfoResult } from '../../types/clmm';

/**
 * Get CLMM Pool Information
 *
 * Fetches comprehensive CLMM pool data including:
 * - Token addresses and amounts
 * - Current price and tick
 * - Tick spacing (returned as binStep for API compatibility)
 * - Fee configuration
 *
 * @param raydium - Raydium connector instance
 * @param params - Pool info parameters
 * @returns Pool information
 */
export async function getPoolInfo(
  raydium: any, // Will be properly typed as RaydiumConnector
  params: PoolInfoParams,
): Promise<PoolInfoResult> {
  const poolInfo = await raydium.getClmmPoolInfo(params.poolAddress);

  if (!poolInfo) {
    throw new Error(`Pool not found for address: ${params.poolAddress}`);
  }

  return poolInfo;
}

/**
 * Meteora Pool Info Operation
 *
 * Gets comprehensive information about a Meteora DLMM pool.
 */

import { PoolInfoParams, PoolInfoResult } from '../../types';

/**
 * Get pool information
 *
 * This is a query operation (read-only).
 * Returns detailed pool information including liquidity bins.
 *
 * @param meteora Meteora connector instance
 * @param params Pool info parameters
 * @returns Pool information
 */
export async function getPoolInfo(
  meteora: any, // Meteora connector
  params: PoolInfoParams,
): Promise<PoolInfoResult> {
  const { poolAddress } = params;

  const poolInfo = await meteora.getPoolInfo(poolAddress);

  if (!poolInfo) {
    throw new Error(`Pool not found or invalid: ${poolAddress}`);
  }

  return poolInfo;
}

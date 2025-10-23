/**
 * Raydium CLMM Position Info Query
 *
 * Query operation to fetch CLMM position information.
 * Retrieves position details including token amounts and unclaimed fees.
 */

import { PositionInfoParams, PositionInfoResult } from '../../types/clmm';

/**
 * Get CLMM Position Information
 *
 * Fetches detailed position information including:
 * - Position address and pool address
 * - Token amounts (base and quote)
 * - Unclaimed fees
 * - Price range (lower/upper)
 * - Current price
 *
 * @param raydium - Raydium connector instance
 * @param params - Position info parameters
 * @returns Position information
 */
export async function getPositionInfo(
  raydium: any, // Will be properly typed as RaydiumConnector
  params: PositionInfoParams,
): Promise<PositionInfoResult> {
  const positionInfo = await raydium.getPositionInfo(params.positionAddress);

  if (!positionInfo) {
    throw new Error(`Position not found for address: ${params.positionAddress}`);
  }

  return positionInfo;
}

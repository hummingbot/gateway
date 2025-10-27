/**
 * Meteora Fetch Pools Operation
 *
 * Gets available Meteora DLMM pools with optional token filtering.
 */

import { FetchPoolsParams, FetchPoolsResult, PoolSummary } from '../../types';

/**
 * Fetch Meteora pools
 *
 * This is a query operation (read-only).
 * Returns a list of available pools, optionally filtered by tokens.
 *
 * @param meteora Meteora connector instance
 * @param solana Solana chain instance
 * @param params Fetch parameters
 * @returns List of pool summaries
 */
export async function fetchPools(
  meteora: any, // Meteora connector
  solana: any,  // Solana chain
  params: FetchPoolsParams,
): Promise<FetchPoolsResult> {
  const { limit = 100, tokenA, tokenB } = params;

  // Resolve token symbols to addresses if provided
  let tokenMintA: string | undefined;
  let tokenMintB: string | undefined;

  if (tokenA) {
    const tokenAInfo = await solana.getToken(tokenA);
    if (!tokenAInfo) {
      throw new Error(`Token not found: ${tokenA}`);
    }
    tokenMintA = tokenAInfo.address;
  }

  if (tokenB) {
    const tokenBInfo = await solana.getToken(tokenB);
    if (!tokenBInfo) {
      throw new Error(`Token not found: ${tokenB}`);
    }
    tokenMintB = tokenBInfo.address;
  }

  // Get pools from Meteora
  const lbPairs = await meteora.getPools(limit, tokenMintA, tokenMintB);

  // Transform to SDK format
  const pools: PoolSummary[] = lbPairs.map((pair: any) => {
    // Get current price from active bin
    const price = pair.account?.activeId
      ? Number(pair.account.getCurrentPrice())
      : 0;

    return {
      publicKey: pair.publicKey.toBase58(),
      tokenX: pair.account.tokenXMint.toBase58(),
      tokenY: pair.account.tokenYMint.toBase58(),
      binStep: pair.account.binStep,
      price,
    };
  });

  return { pools };
}

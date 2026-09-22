import { FetchPoolsResponseType } from '../../../schemas/clmm-schema';
import { Orca } from '../orca';

export interface OrcaFetchPoolsArgs {
  network: string;
  limit?: number;
  query?: string;
  sortBy?: string;
  sortDirection?: string;
  verifiedOnly?: boolean;
}

/**
 * Fetch pools from Orca's own pool-discovery API and normalize them into the
 * shared FetchPoolsResponse shape. Reached through GET /trading/clmm/fetch-pools.
 *
 * Orca's API returns a flat list with no total count and no pagination, so the
 * response reports page 1 and a total equal to what came back.
 */
export async function fetchPools(args: OrcaFetchPoolsArgs): Promise<FetchPoolsResponseType> {
  const { network, limit = 50, query, sortBy, sortDirection, verifiedOnly } = args;

  const orca = await Orca.getInstance(network);

  const rawPools = await orca.fetchPoolsFromApi({
    limit,
    query,
    sortBy,
    sortDirection,
    verifiedOnly,
  });

  // Map to the shared format (same shape as Meteora)
  const pools = rawPools.map((pool: any) => ({
    address: pool.address,
    name: `${pool.tokenA?.symbol || '?'}-${pool.tokenB?.symbol || '?'}`,
    baseTokenAddress: pool.tokenMintA,
    baseTokenSymbol: pool.tokenA?.symbol || '',
    quoteTokenAddress: pool.tokenMintB,
    quoteTokenSymbol: pool.tokenB?.symbol || '',
    binStep: pool.tickSpacing,
    baseFee: Number(pool.feeRate) / 10000, // Convert to percentage
    price: Number(pool.price),
    tvl: Number(pool.tvlUsdc) || 0,
    apr: pool.feeApr?.day ? Number(pool.feeApr.day) * 100 : undefined, // Convert to percentage
    apy: pool.totalApr?.day ? Number(pool.totalApr.day) * 100 : undefined,
    volume24h: pool.volume?.day ? Number(pool.volume.day) : undefined,
    fees24h: pool.fees?.day ? Number(pool.fees.day) : undefined,
  }));

  return {
    pools,
    total: pools.length, // Orca API doesn't return total count
    page: 1,
    pageSize: limit,
  };
}

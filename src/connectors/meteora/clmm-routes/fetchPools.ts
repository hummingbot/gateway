import { FetchPoolsResponseType } from '../../../schemas/clmm-schema';
import { Meteora, MeteoraApiPool } from '../meteora';

export interface MeteoraFetchPoolsArgs {
  network: string;
  limit?: number;
  query?: string;
  sortBy?: string;
  /** 0-based page index. Meteora's API paginates; Orca's does not. */
  page?: number;
  includeUnverified?: boolean;
}

/**
 * Fetch pools from Meteora's own pool-discovery API and normalize them into the
 * shared FetchPoolsResponse shape. Reached through GET /trading/clmm/fetch-pools.
 */
export async function fetchPools(args: MeteoraFetchPoolsArgs): Promise<FetchPoolsResponseType> {
  const { network, page, limit, query, sortBy, includeUnverified } = args;

  const meteora = await Meteora.getInstance(network);

  const result = await meteora.fetchPoolsFromApi({
    page,
    limit,
    query,
    sortBy,
    includeUnverified,
  });

  // Map the API response to the shared format
  const pools = result.pools.map((pool: MeteoraApiPool) => ({
    address: pool.address,
    name: pool.name,
    baseTokenAddress: pool.token_x.address,
    baseTokenSymbol: pool.token_x.symbol,
    quoteTokenAddress: pool.token_y.address,
    quoteTokenSymbol: pool.token_y.symbol,
    binStep: pool.pool_config.bin_step,
    baseFee: pool.pool_config.base_fee_pct,
    price: pool.current_price,
    tvl: pool.tvl,
    apr: pool.apr,
    apy: pool.apy,
    volume24h: pool.volume?.['24h'],
    fees24h: pool.fees?.['24h'],
  }));

  return {
    pools,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

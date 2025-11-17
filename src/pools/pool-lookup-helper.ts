/**
 * Helper function for fetching detailed pool information from GeckoTerminal and connectors
 */

import { CoinGeckoService, TopPoolInfo } from '../services/coingecko-service';
import { extractRawPoolData, toPoolGeckoData } from '../services/gecko-types';
import { logger } from '../services/logger';

import { fetchPoolInfo, resolveTokenSymbols } from './pool-info-helpers';
import { Pool } from './types';

export interface PoolLookupResult {
  poolData: TopPoolInfo;
  poolInfo: {
    baseTokenAddress: string;
    quoteTokenAddress: string;
    feePct: number;
  };
  pool: Pool;
}

/**
 * Fetch detailed pool information by address from GeckoTerminal and connector
 * This is shared logic used by both /pools/find/:address and /pools/:address
 */
export async function fetchDetailedPoolInfo(chainNetwork: string, address: string): Promise<PoolLookupResult> {
  // Parse chain-network parameter using CoinGeckoService
  const coinGeckoService = CoinGeckoService.getInstance();
  const { network } = coinGeckoService.parseChainNetwork(chainNetwork);

  // Fetch pool info from GeckoTerminal
  const poolData = await coinGeckoService.getPoolInfo(chainNetwork, address);

  // Validate that we have connector info
  if (!poolData.connector || !poolData.type) {
    throw new Error(`Pool ${address} has no connector/type mapping from GeckoTerminal (dex: ${poolData.dex})`);
  }

  // Fetch detailed pool info from the connector
  const poolInfo = await fetchPoolInfo(poolData.connector, poolData.type as 'amm' | 'clmm', network, address);

  if (!poolInfo) {
    throw new Error(`Unable to fetch pool-info from connector ${poolData.connector} (may not be supported)`);
  }

  // Resolve token symbols - handle missing tokens gracefully
  const symbols = await resolveTokenSymbols(
    poolData.connector,
    network,
    poolInfo.baseTokenAddress,
    poolInfo.quoteTokenAddress,
  );

  const baseSymbol = symbols.baseSymbol || poolData.baseTokenSymbol;
  const quoteSymbol = symbols.quoteSymbol || poolData.quoteTokenSymbol;

  if (!baseSymbol || !quoteSymbol) {
    throw new Error(
      `Could not resolve symbols for pool ${address} (base: ${baseSymbol || 'unknown'}, quote: ${quoteSymbol || 'unknown'})`,
    );
  }

  // Calculate APR if we have volume and liquidity data
  let apr: number | undefined;
  if (poolData.volumeUsd24h && poolData.liquidityUsd) {
    const volume = parseFloat(poolData.volumeUsd24h);
    const liquidity = parseFloat(poolData.liquidityUsd);
    if (!isNaN(volume) && !isNaN(liquidity) && liquidity > 0) {
      // APR = (daily volume * fee% / liquidity) * 365 * 100
      apr = ((volume * (poolInfo.feePct / 100)) / liquidity) * 365 * 100;
    }
  }

  // Create pool object with CoinGecko data separated
  // Use typed transformation helper to ensure consistent geckoData format
  const rawPoolData = extractRawPoolData(poolData);
  const geckoData = toPoolGeckoData(rawPoolData, apr);

  const pool: Pool = {
    type: poolData.type as 'amm' | 'clmm',
    network,
    baseSymbol,
    quoteSymbol,
    baseTokenAddress: poolInfo.baseTokenAddress,
    quoteTokenAddress: poolInfo.quoteTokenAddress,
    feePct: poolInfo.feePct,
    address,
    geckoData,
  };

  return {
    poolData,
    poolInfo,
    pool,
  };
}

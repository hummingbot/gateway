/**
 * Helper function for fetching detailed pool information from GeckoTerminal and connectors
 */

import { CoinGeckoService, TopPoolInfo } from '../services/coingecko-service';
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

  // If symbols not found locally (or are DUMMY_ placeholders), fetch from GeckoTerminal token info endpoint
  let baseSymbol = symbols.baseSymbol;
  let quoteSymbol = symbols.quoteSymbol;

  // Check if symbol is missing or is a DUMMY_ placeholder
  const needsBaseSymbol = !baseSymbol || baseSymbol.startsWith('DUMMY_');
  const needsQuoteSymbol = !quoteSymbol || quoteSymbol.startsWith('DUMMY_');

  if (needsBaseSymbol) {
    try {
      const tokenInfo = await coinGeckoService.getTokenInfo(chainNetwork, poolInfo.baseTokenAddress);
      baseSymbol = tokenInfo.symbol;
      logger.info(`Resolved base token symbol from GeckoTerminal: ${baseSymbol}`);
    } catch (error) {
      logger.warn(`Failed to fetch base token info, using pool name: ${error.message}`);
      baseSymbol = poolData.baseTokenSymbol;
    }
  }

  if (needsQuoteSymbol) {
    try {
      const tokenInfo = await coinGeckoService.getTokenInfo(chainNetwork, poolInfo.quoteTokenAddress);
      quoteSymbol = tokenInfo.symbol;
      logger.info(`Resolved quote token symbol from GeckoTerminal: ${quoteSymbol}`);
    } catch (error) {
      logger.warn(`Failed to fetch quote token info, using pool name: ${error.message}`);
      quoteSymbol = poolData.quoteTokenSymbol;
    }
  }

  if (!baseSymbol || !quoteSymbol) {
    throw new Error(
      `Could not resolve symbols for pool ${address} (base: ${baseSymbol || 'unknown'}, quote: ${quoteSymbol || 'unknown'})`,
    );
  }

  const pool: Pool = {
    connector: poolData.connector,
    type: poolData.type as 'amm' | 'clmm',
    network,
    baseSymbol,
    quoteSymbol,
    baseTokenAddress: poolInfo.baseTokenAddress,
    quoteTokenAddress: poolInfo.quoteTokenAddress,
    feePct: poolInfo.feePct,
    address,
  };

  return {
    poolData,
    poolInfo,
    pool,
  };
}

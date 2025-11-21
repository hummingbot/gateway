/**
 * Pool Cache Service
 *
 * LRU cache for pool info data to reduce API calls.
 * Pool data includes liquidity, bins, prices which can change frequently,
 * so a shorter TTL (2 minutes) is used compared to transaction cache.
 */

import { LRUCache } from 'lru-cache';
import type { ExtendedPoolInfo } from './gateway-types';

/**
 * Cache key format: `${chain}:${network}:${connector}:${address}`
 */
function getCacheKey(
  chain: string,
  network: string,
  connector: string,
  address: string
): string {
  return `${chain}:${network}:${connector}:${address}`;
}

/**
 * LRU cache for pool info data
 *
 * Configuration:
 * - max: 200 pools (sufficient for most use cases)
 * - ttl: 2 minutes (auto-expire for fresh pool data)
 * - updateAgeOnGet: false (don't refresh TTL on access, force refresh after 2 minutes)
 */
const poolCache = new LRUCache<string, ExtendedPoolInfo>({
  max: 200,
  ttl: 1000 * 60 * 2, // 2 minutes
  updateAgeOnGet: false,
});

/**
 * Get cached pool info
 *
 * @param chain - Chain name (e.g., 'solana', 'ethereum')
 * @param network - Network name (e.g., 'mainnet-beta', 'mainnet')
 * @param connector - Connector name (e.g., 'meteora', 'raydium', 'uniswap')
 * @param address - Pool address
 * @returns Cached pool info or undefined if not found/expired
 */
export function getCachedPoolInfo(
  chain: string,
  network: string,
  connector: string,
  address: string
): ExtendedPoolInfo | undefined {
  const key = getCacheKey(chain, network, connector, address);
  return poolCache.get(key);
}

/**
 * Store pool info in cache
 *
 * @param chain - Chain name
 * @param network - Network name
 * @param connector - Connector name
 * @param address - Pool address
 * @param data - Pool info data
 */
export function setCachedPoolInfo(
  chain: string,
  network: string,
  connector: string,
  address: string,
  data: ExtendedPoolInfo
): void {
  const key = getCacheKey(chain, network, connector, address);
  poolCache.set(key, data);
}

/**
 * Get cache statistics
 *
 * @returns Object with cache stats (size, max, etc.)
 */
export function getPoolCacheStats() {
  return {
    size: poolCache.size,
    max: poolCache.max,
    calculatedSize: poolCache.calculatedSize,
  };
}

/**
 * Clear all cached pool info
 */
export function clearPoolCache(): void {
  poolCache.clear();
}

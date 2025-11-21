/**
 * Transaction Cache Service
 *
 * LRU cache for parsed transaction data to reduce RPC calls.
 * Transactions are immutable, so cached data never needs invalidation.
 */

import { LRUCache } from 'lru-cache';
import type { ParseResponseType } from './gateway-types';

/**
 * Cache key format: `${chain}:${network}:${signature}`
 */
function getCacheKey(chain: string, network: string, signature: string): string {
  return `${chain}:${network}:${signature}`;
}

/**
 * LRU cache for parsed transaction data
 *
 * Configuration:
 * - max: 500 transactions (keeps most recent)
 * - ttl: 1 hour (auto-expire old entries)
 * - updateAgeOnGet: true (refresh TTL on access)
 */
const transactionCache = new LRUCache<string, ParseResponseType>({
  max: 500,
  ttl: 1000 * 60 * 60, // 1 hour
  updateAgeOnGet: true,
});

/**
 * Get parsed transaction from cache
 *
 * @param chain - Chain name (e.g., 'solana', 'ethereum')
 * @param network - Network name (e.g., 'mainnet-beta', 'mainnet')
 * @param signature - Transaction signature/hash
 * @returns Cached parsed transaction or undefined if not found
 */
export function getCachedTransaction(
  chain: string,
  network: string,
  signature: string
): ParseResponseType | undefined {
  const key = getCacheKey(chain, network, signature);
  return transactionCache.get(key);
}

/**
 * Store parsed transaction in cache
 *
 * @param chain - Chain name
 * @param network - Network name
 * @param signature - Transaction signature/hash
 * @param data - Parsed transaction data
 */
export function setCachedTransaction(
  chain: string,
  network: string,
  signature: string,
  data: ParseResponseType
): void {
  const key = getCacheKey(chain, network, signature);
  transactionCache.set(key, data);
}

/**
 * Get cache statistics
 *
 * @returns Object with cache stats (size, hits, misses, etc.)
 */
export function getCacheStats() {
  return {
    size: transactionCache.size,
    max: transactionCache.max,
    calculatedSize: transactionCache.calculatedSize,
  };
}

/**
 * Clear all cached transactions
 */
export function clearCache(): void {
  transactionCache.clear();
}

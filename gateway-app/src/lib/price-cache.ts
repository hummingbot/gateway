/**
 * Price Cache Service
 *
 * LRU cache for token prices to reduce quote API calls.
 * Prices are fetched in native currency (SOL, ETH, etc.) and converted to USDC
 * using a single native→USDC rate.
 *
 * Strategy:
 * - Fetch all token prices in native currency (TOKEN → NATIVE)
 * - Fetch one native→USDC rate (NATIVE → USDC)
 * - Calculate USDC prices: TOKEN_USDC = TOKEN_NATIVE × NATIVE_USDC
 */

import { LRUCache } from 'lru-cache';

/**
 * Price data for a token
 */
export interface TokenPrice {
  /** Price in native currency (SOL, ETH, etc.) */
  nativePrice: number;
  /** Price in USDC (derived from native price × native-to-USDC rate) */
  usdcPrice: number;
  /** Timestamp when price was fetched */
  timestamp: number;
}

/**
 * Cache key format: `${chain}:${network}:${tokenSymbol}`
 */
function getCacheKey(chain: string, network: string, tokenSymbol: string): string {
  return `${chain}:${network}:${tokenSymbol}`;
}

/**
 * LRU cache for token prices
 *
 * Configuration:
 * - max: 1000 tokens (covers most token lists)
 * - ttl: 30 seconds (auto-expire for fresh prices)
 * - updateAgeOnGet: false (don't refresh TTL on access, force refresh after 30s)
 */
const priceCache = new LRUCache<string, TokenPrice>({
  max: 1000,
  ttl: 1000 * 30, // 30 seconds
  updateAgeOnGet: false,
});

/**
 * Get cached price for a token
 *
 * @param chain - Chain name (e.g., 'solana', 'ethereum')
 * @param network - Network name (e.g., 'mainnet-beta', 'mainnet')
 * @param tokenSymbol - Token symbol (e.g., 'SOL', 'USDC', 'RAY')
 * @returns Cached price or undefined if not found/expired
 */
export function getCachedPrice(
  chain: string,
  network: string,
  tokenSymbol: string
): TokenPrice | undefined {
  const key = getCacheKey(chain, network, tokenSymbol);
  return priceCache.get(key);
}

/**
 * Store token price in cache
 *
 * @param chain - Chain name
 * @param network - Network name
 * @param tokenSymbol - Token symbol
 * @param price - Price data
 */
export function setCachedPrice(
  chain: string,
  network: string,
  tokenSymbol: string,
  price: TokenPrice
): void {
  const key = getCacheKey(chain, network, tokenSymbol);
  priceCache.set(key, price);
}

/**
 * Get cache statistics
 *
 * @returns Object with cache stats (size, max, etc.)
 */
export function getPriceCacheStats() {
  return {
    size: priceCache.size,
    max: priceCache.max,
    calculatedSize: priceCache.calculatedSize,
  };
}

/**
 * Clear all cached prices
 */
export function clearPriceCache(): void {
  priceCache.clear();
}

import { logger } from './logger';

interface CachedQuote {
  quote: any;
  request: any;
}

/**
 * Global quote cache for router quotes across all connectors
 * Uses quote_id as the key for simple lookup
 */
class QuoteCache {
  private static instance: QuoteCache;
  private cache: Map<string, CachedQuote>;

  private constructor() {
    this.cache = new Map();
  }

  /**
   * Get singleton instance of QuoteCache
   */
  public static getInstance(): QuoteCache {
    if (!QuoteCache.instance) {
      QuoteCache.instance = new QuoteCache();
    }
    return QuoteCache.instance;
  }

  /**
   * Get a quote from cache by quote ID
   * @param quoteId The unique quote identifier
   * @returns The cached quote data or null if not found
   */
  public get(quoteId: string): any | null {
    const cached = this.cache.get(quoteId);
    if (!cached) {
      return null;
    }

    return cached.quote;
  }

  /**
   * Store a quote in cache
   * @param quoteId The unique quote identifier
   * @param quote The quote data to cache
   * @param request The original request data (optional)
   */
  public set(quoteId: string, quote: any, request?: any): void {
    this.cache.set(quoteId, {
      quote,
      request: request || {},
    });
    logger.debug(`Quote cache: Stored quote ${quoteId}`);
  }

  /**
   * Delete a specific quote from cache
   * @param quoteId The unique quote identifier
   */
  public delete(quoteId: string): void {
    if (this.cache.delete(quoteId)) {
      logger.debug(`Quote cache: Manually deleted quote ${quoteId}`);
    }
  }

  /**
   * Clear all quotes from cache
   */
  public clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.debug(`Quote cache: Cleared all ${size} quotes`);
  }

  /**
   * Get the current size of the cache
   */
  public size(): number {
    return this.cache.size;
  }
}

// Export singleton instance
export const quoteCache = QuoteCache.getInstance();

// Export the QuoteCache class for type definitions if needed
export { QuoteCache };

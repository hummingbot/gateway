import { logger } from './logger';

interface CachedQuote {
  quote: any;
  timestamp: number;
  request: any;
}

/**
 * Global quote cache for router quotes across all connectors
 * Uses quote_id as the key for simple lookup
 */
class QuoteCache {
  private static instance: QuoteCache;
  private cache: Map<string, CachedQuote>;
  private readonly QUOTE_TTL = 120000; // 2 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.cache = new Map();
    this.startCleanupInterval();
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
   * Start periodic cleanup of expired quotes
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [quoteId, cached] of this.cache.entries()) {
        if (now - cached.timestamp > this.QUOTE_TTL) {
          this.cache.delete(quoteId);
          logger.debug(`Quote cache: Deleted expired quote ${quoteId}`);
        }
      }
    }, 10000); // Run every 10 seconds
  }

  /**
   * Get a quote from cache by quote ID
   * @param quoteId The unique quote identifier
   * @returns The cached quote data or null if not found/expired
   */
  public get(quoteId: string): any | null {
    const cached = this.cache.get(quoteId);
    if (!cached) {
      return null;
    }

    // Check if quote is expired
    if (Date.now() - cached.timestamp > this.QUOTE_TTL) {
      this.cache.delete(quoteId);
      logger.debug(`Quote cache: Deleted expired quote ${quoteId} on access`);
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
      timestamp: Date.now(),
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

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  public stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Export singleton instance
export const quoteCache = QuoteCache.getInstance();

// Export the QuoteCache class for type definitions if needed
export { QuoteCache };

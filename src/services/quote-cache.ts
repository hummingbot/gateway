import { logger } from './logger';

/**
 * What a cached quote is bound to.
 *
 * A router quote is not a free-floating price. Depending on the connector it is fixed
 * calldata built for one taker on one network, and spending it from somewhere else does
 * not fail loudly — it sends the output where the quote said, and bills whoever executed.
 * Every connector declares its binding when it caches a quote, and
 * /trading/router/execute-quote checks it before the quote is spent.
 */
export interface QuoteBinding {
  /** Connector that built the quote. */
  connector: string;
  /** Network it was built against. */
  network: string;
  /**
   * Address the quote's transaction pays out to, or null when the quote is
   * wallet-agnostic: rebuilt for the executing wallet at execution time (Jupiter, dFlow,
   * OKX), or routed to msg.sender by the Universal Router's SENDER_AS_RECIPIENT sentinel
   * (Uniswap and PancakeSwap, when no wallet was named on the quote). A non-null value
   * may only be spent by that wallet.
   */
  wallet: string | null;
}

interface CachedQuote {
  binding: QuoteBinding;
  quote: any;
  request: any;
  expiresAt: number;
}

/**
 * How long a quote stays spendable. A quote is a price snapshot plus, on some connectors,
 * calldata carrying a minimum-out computed from that snapshot; neither stays true for
 * long. Without this, an entry that was never executed sat in the map for the life of the
 * process and "Quote not found or expired" could only ever mean "not found".
 */
const QUOTE_TTL_MS = 5 * 60 * 1000;

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

  /** Look up an entry, treating one that has outlived its TTL as absent. */
  private live(quoteId: string): CachedQuote | null {
    const cached = this.cache.get(quoteId);
    if (!cached) {
      return null;
    }
    if (Date.now() >= cached.expiresAt) {
      this.cache.delete(quoteId);
      logger.debug(`Quote cache: Dropped expired quote ${quoteId}`);
      return null;
    }
    return cached;
  }

  /**
   * Get a quote from cache by quote ID
   * @param quoteId The unique quote identifier
   * @returns The cached quote data or null if not found or expired
   */
  public get(quoteId: string): any | null {
    return this.live(quoteId)?.quote ?? null;
  }

  /**
   * Get the original request data stored alongside a quote
   * @param quoteId The unique quote identifier
   * @returns The cached request data or null if not found or expired
   */
  public getRequest(quoteId: string): any | null {
    return this.live(quoteId)?.request ?? null;
  }

  /**
   * Get what the quote is bound to, for the checks execute-quote runs before spending it
   * @param quoteId The unique quote identifier
   * @returns The binding or null if not found or expired
   */
  public getBinding(quoteId: string): QuoteBinding | null {
    return this.live(quoteId)?.binding ?? null;
  }

  /**
   * Store a quote in cache
   * @param quoteId The unique quote identifier
   * @param binding What the quote may be spent as - connector, network, and taker
   * @param quote The quote data to cache
   * @param request The original request data (optional)
   */
  public set(quoteId: string, binding: QuoteBinding, quote: any, request?: any): void {
    this.sweep();
    this.cache.set(quoteId, {
      binding,
      quote,
      request: request || {},
      expiresAt: Date.now() + QUOTE_TTL_MS,
    });
    logger.debug(`Quote cache: Stored quote ${quoteId}`);
  }

  /** Drop entries that have outlived their TTL, so unspent quotes do not accumulate. */
  private sweep(): void {
    const now = Date.now();
    for (const [quoteId, cached] of this.cache) {
      if (now >= cached.expiresAt) {
        this.cache.delete(quoteId);
        logger.debug(`Quote cache: Swept expired quote ${quoteId}`);
      }
    }
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

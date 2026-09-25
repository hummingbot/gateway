import { logger } from './logger';

interface CachedQuote {
  connector: string;
  quote: any;
  request: any;
}

/**
 * Global quote cache for router and launch quotes across all connectors.
 *
 * Every quote is stored under the connector that priced it and is only handed back to
 * that connector: a quoteId from one connector must never execute through another's
 * route, whose cached shape and signing path it does not match.
 */
class QuoteCache {
  private static instance: QuoteCache;
  private cache: Map<string, CachedQuote>;

  private constructor() {
    this.cache = new Map();
  }

  public static getInstance(): QuoteCache {
    if (!QuoteCache.instance) {
      QuoteCache.instance = new QuoteCache();
    }
    return QuoteCache.instance;
  }

  /**
   * The quote `connector` cached under `quoteId`, or null when there is none — including
   * when the quoteId belongs to a different connector.
   */
  public get(quoteId: string, connector: string): any | null {
    const cached = this.cache.get(quoteId);
    if (!cached || cached.connector !== connector) {
      return null;
    }
    return cached.quote;
  }

  /** The request stored alongside `connector`'s quote, or null when there is none. */
  public getRequest(quoteId: string, connector: string): any | null {
    const cached = this.cache.get(quoteId);
    if (!cached || cached.connector !== connector) {
      return null;
    }
    return cached.request;
  }

  public set(quoteId: string, connector: string, quote: any, request: any = {}): void {
    this.cache.set(quoteId, { connector, quote, request });
    logger.debug(`Quote cache: Stored ${connector} quote ${quoteId}`);
  }

  public delete(quoteId: string): void {
    if (this.cache.delete(quoteId)) {
      logger.debug(`Quote cache: Deleted quote ${quoteId}`);
    }
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}

export const quoteCache = QuoteCache.getInstance();

export { QuoteCache };

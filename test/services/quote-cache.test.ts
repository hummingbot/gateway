// Mock logger before importing QuoteCache
jest.mock('../../src/services/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { QuoteCache, QuoteBinding } from '../../src/services/quote-cache';

const BINDING: QuoteBinding = { connector: 'jupiter', network: 'mainnet-beta', wallet: null };

describe('QuoteCache', () => {
  let cache: QuoteCache;

  beforeEach(() => {
    // Get a fresh instance for each test
    cache = QuoteCache.getInstance();
    cache.clear();
  });

  afterEach(() => {
    // Clear cache after each test
    cache.clear();
  });

  describe('basic operations', () => {
    it('should store and retrieve quotes', () => {
      const quoteId = 'test-quote-123';
      const quoteData = {
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        inAmount: '1000000000',
        outAmount: '1000000',
      };

      cache.set(quoteId, BINDING, quoteData);
      const retrieved = cache.get(quoteId);

      expect(retrieved).toEqual(quoteData);
    });

    it('should return null for non-existent quotes', () => {
      const result = cache.get('non-existent-id');
      expect(result).toBeNull();
    });

    it('should delete quotes', () => {
      const quoteId = 'test-quote-456';
      const quoteData = { test: 'data' };

      cache.set(quoteId, BINDING, quoteData);
      expect(cache.get(quoteId)).toEqual(quoteData);

      cache.delete(quoteId);
      expect(cache.get(quoteId)).toBeNull();
    });

    it('should clear all quotes', () => {
      cache.set('quote1', BINDING, { data: 1 });
      cache.set('quote2', BINDING, { data: 2 });
      cache.set('quote3', BINDING, { data: 3 });

      expect(cache.size()).toBe(3);

      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get('quote1')).toBeNull();
      expect(cache.get('quote2')).toBeNull();
      expect(cache.get('quote3')).toBeNull();
    });

    it('should store request data along with quote', () => {
      const quoteId = 'test-quote-789';
      const quoteData = { test: 'quote' };
      const requestData = { network: 'mainnet-beta', amount: 100 };

      cache.set(quoteId, BINDING, quoteData, requestData);

      expect(cache.get(quoteId)).toEqual(quoteData);
      expect(cache.getRequest(quoteId)).toEqual(requestData);
    });

    it('should store the binding the quote may be spent under', () => {
      const binding: QuoteBinding = {
        connector: 'uniswap',
        network: 'bsc',
        wallet: '0x628010E5B0c4dC04CAF498312486841630f8b567',
      };

      cache.set('bound-quote', binding, { test: 'quote' });

      expect(cache.getBinding('bound-quote')).toEqual(binding);
      expect(cache.getBinding('non-existent-id')).toBeNull();
    });
  });

  // A quote is a price snapshot plus, on some connectors, calldata carrying a minimum-out
  // computed from it. Entries used to live for the life of the process, so the cache grew
  // without bound and "not found or expired" could only ever mean "not found".
  describe('expiry', () => {
    const TTL_MS = 5 * 60 * 1000;
    let clock: number;

    beforeEach(() => {
      clock = 1_700_000_000_000;
      jest.spyOn(Date, 'now').mockImplementation(() => clock);
    });

    afterEach(() => jest.restoreAllMocks());

    it('serves a quote right up to the TTL and not past it', () => {
      cache.set('aging', BINDING, { test: 'quote' });

      clock += TTL_MS - 1;
      expect(cache.get('aging')).toEqual({ test: 'quote' });

      clock += 1;
      expect(cache.get('aging')).toBeNull();
      expect(cache.getBinding('aging')).toBeNull();
      expect(cache.getRequest('aging')).toBeNull();
    });

    it('drops an expired quote rather than holding it', () => {
      cache.set('expiring', BINDING, { test: 'quote' });
      expect(cache.size()).toBe(1);

      clock += TTL_MS;
      expect(cache.get('expiring')).toBeNull();
      expect(cache.size()).toBe(0);
    });

    it('sweeps quotes nobody came back for', () => {
      cache.set('abandoned-1', BINDING, { test: 1 });
      cache.set('abandoned-2', BINDING, { test: 2 });
      expect(cache.size()).toBe(2);

      clock += TTL_MS;
      cache.set('fresh', BINDING, { test: 3 });

      expect(cache.size()).toBe(1);
      expect(cache.get('fresh')).toEqual({ test: 3 });
    });
  });

  describe('singleton behavior', () => {
    it('should return the same instance', () => {
      const instance1 = QuoteCache.getInstance();
      const instance2 = QuoteCache.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('size tracking', () => {
    it('should track cache size correctly', () => {
      expect(cache.size()).toBe(0);

      cache.set('quote1', BINDING, { data: 1 });
      expect(cache.size()).toBe(1);

      cache.set('quote2', BINDING, { data: 2 });
      cache.set('quote3', BINDING, { data: 3 });
      expect(cache.size()).toBe(3);

      cache.delete('quote2');
      expect(cache.size()).toBe(2);

      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });
});

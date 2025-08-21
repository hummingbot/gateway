// Mock logger before importing QuoteCache
jest.mock('../../src/services/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { QuoteCache } from '../../src/services/quote-cache';

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

      cache.set(quoteId, quoteData);
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

      cache.set(quoteId, quoteData);
      expect(cache.get(quoteId)).toEqual(quoteData);

      cache.delete(quoteId);
      expect(cache.get(quoteId)).toBeNull();
    });

    it('should clear all quotes', () => {
      cache.set('quote1', { data: 1 });
      cache.set('quote2', { data: 2 });
      cache.set('quote3', { data: 3 });

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

      cache.set(quoteId, quoteData, requestData);
      const retrieved = cache.get(quoteId);

      expect(retrieved).toEqual(quoteData);
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

      cache.set('quote1', { data: 1 });
      expect(cache.size()).toBe(1);

      cache.set('quote2', { data: 2 });
      cache.set('quote3', { data: 3 });
      expect(cache.size()).toBe(3);

      cache.delete('quote2');
      expect(cache.size()).toBe(2);

      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });
});

// Mock logger before importing QuoteCache
jest.mock('../../src/services/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { quoteCache } from '../../src/services/quote-cache';

describe('QuoteCache', () => {
  const quote = { inAmount: '1000000000', outAmount: '1000000' };
  const request = { network: 'mainnet-beta', slippagePct: 0.5 };

  afterEach(() => {
    quoteCache.delete('q');
  });

  it('hands a quote and its request back to the connector that cached it', () => {
    quoteCache.set('q', 'jupiter', quote, request);

    expect(quoteCache.get('q', 'jupiter')).toEqual(quote);
    expect(quoteCache.getRequest('q', 'jupiter')).toEqual(request);
  });

  it('hides a quote from every other connector', () => {
    quoteCache.set('q', 'jupiter', quote, request);

    expect(quoteCache.get('q', 'dflow')).toBeNull();
    expect(quoteCache.getRequest('q', 'dflow')).toBeNull();
  });

  it('returns null for an unknown or deleted quote', () => {
    expect(quoteCache.get('q', 'jupiter')).toBeNull();

    quoteCache.set('q', 'jupiter', quote);
    quoteCache.delete('q');
    expect(quoteCache.get('q', 'jupiter')).toBeNull();
  });
});

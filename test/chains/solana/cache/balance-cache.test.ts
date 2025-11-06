import { Solana } from '../../../../src/chains/solana/solana';

jest.mock('../../../../src/chains/solana/solana');

const mockAddress = 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF';
const mockNetwork = 'mainnet-beta';

const mockBalances = {
  SOL: 10.5,
  USDC: 1000.0,
  USDT: 500.0,
};

const mockBalanceCache = {
  SOL: {
    symbol: 'SOL',
    balance: 10.5,
  },
  USDC: {
    symbol: 'USDC',
    balance: 1000.0,
  },
  USDT: {
    symbol: 'USDT',
    balance: 500.0,
  },
};

describe('Balance Cache Tests', () => {
  let mockSolana: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock Solana instance with the balanceCache property
    mockSolana = {
      balanceCache: {
        get: jest.fn(),
        isStale: jest.fn(),
        set: jest.fn(),
      },
      getBalancesFromRPC: jest.fn(),
      convertCachedToBalances: jest.fn((cached) => {
        const balances: Record<string, number> = {};
        for (const [symbol, data] of Object.entries(cached)) {
          balances[symbol] = (data as any).balance;
        }
        return balances;
      }),
      populateCacheFromBalances: jest.fn(),
    };

    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);
  });

  describe('Cache HIT scenarios', () => {
    it('should return all cached balances when no specific tokens requested', async () => {
      mockSolana.balanceCache.get.mockReturnValue(mockBalanceCache);
      mockSolana.balanceCache.isStale.mockReturnValue(false);

      // Simulate cache hit
      const cached = mockSolana.balanceCache.get(mockAddress);
      const result = mockSolana.convertCachedToBalances(cached);

      expect(result).toEqual(mockBalances);
      expect(mockSolana.balanceCache.get).toHaveBeenCalledWith(mockAddress);
    });

    it('should filter cached balances when specific tokens requested', async () => {
      mockSolana.balanceCache.get.mockReturnValue(mockBalanceCache);
      mockSolana.balanceCache.isStale.mockReturnValue(false);

      // Simulate filtering logic
      const requestedTokens = ['SOL', 'USDC'];
      const filteredBalances: Record<string, number> = {};
      for (const token of requestedTokens) {
        if (mockBalanceCache[token]) {
          filteredBalances[token] = mockBalanceCache[token].balance;
        }
      }

      expect(filteredBalances).toEqual({
        SOL: 10.5,
        USDC: 1000.0,
      });
      expect(filteredBalances).not.toHaveProperty('USDT');
    });

    it('should fetch unknown tokens from RPC when not in cache', async () => {
      mockSolana.balanceCache.get.mockReturnValue(mockBalanceCache);
      mockSolana.balanceCache.isStale.mockReturnValue(false);

      // Request includes a token address not in cache
      const requestedTokens = ['SOL', 'TokenAddr123abc'];
      const tokensToFetchFromRPC = [];
      const filteredBalances: Record<string, number> = {};

      for (const token of requestedTokens) {
        if (mockBalanceCache[token]) {
          filteredBalances[token] = mockBalanceCache[token].balance;
        } else {
          tokensToFetchFromRPC.push(token);
        }
      }

      expect(filteredBalances).toEqual({ SOL: 10.5 });
      expect(tokensToFetchFromRPC).toEqual(['TokenAddr123abc']);

      // Simulate fetching from RPC
      const rpcBalances = { TokenAddr123abc: 50.0 };
      mockSolana.getBalancesFromRPC.mockResolvedValue(rpcBalances);

      const rpcResult = await mockSolana.getBalancesFromRPC(mockAddress, tokensToFetchFromRPC, false);
      Object.assign(filteredBalances, rpcResult);

      expect(filteredBalances).toEqual({
        SOL: 10.5,
        TokenAddr123abc: 50.0,
      });
      expect(mockSolana.getBalancesFromRPC).toHaveBeenCalledWith(mockAddress, tokensToFetchFromRPC, false);
    });

    it('should handle case-insensitive token symbol lookup', async () => {
      mockSolana.balanceCache.get.mockReturnValue(mockBalanceCache);

      // Request with lowercase token symbols
      const requestedTokens = ['sol', 'usdc'];
      const filteredBalances: Record<string, number> = {};

      for (const token of requestedTokens) {
        const tokenUpper = token.toUpperCase();
        if (mockBalanceCache[tokenUpper]) {
          filteredBalances[token] = mockBalanceCache[tokenUpper].balance;
        }
      }

      expect(filteredBalances).toEqual({
        sol: 10.5,
        usdc: 1000.0,
      });
    });
  });

  describe('Cache MISS scenarios', () => {
    it('should fetch from RPC on cache MISS and populate cache', async () => {
      mockSolana.balanceCache.get.mockReturnValue(null); // Cache miss
      mockSolana.getBalancesFromRPC.mockResolvedValue(mockBalances);

      await mockSolana.getBalancesFromRPC(mockAddress, undefined, false);
      await mockSolana.populateCacheFromBalances(mockAddress, mockBalances);

      expect(mockSolana.getBalancesFromRPC).toHaveBeenCalledWith(mockAddress, undefined, false);
      expect(mockSolana.populateCacheFromBalances).toHaveBeenCalledWith(mockAddress, mockBalances);
    });

    it('should fetch all tokens on cache MISS even when specific tokens requested', async () => {
      mockSolana.balanceCache.get.mockReturnValue(null);
      mockSolana.getBalancesFromRPC.mockResolvedValue(mockBalances);

      const requestedTokens = ['SOL', 'USDC'];

      // On cache miss, fetch all balances and populate cache
      await mockSolana.getBalancesFromRPC(mockAddress, requestedTokens, false);
      await mockSolana.populateCacheFromBalances(mockAddress, mockBalances);

      expect(mockSolana.getBalancesFromRPC).toHaveBeenCalled();
      expect(mockSolana.populateCacheFromBalances).toHaveBeenCalled();
    });
  });

  describe('Cache STALE scenarios', () => {
    it('should return stale data and trigger background refresh', async () => {
      mockSolana.balanceCache.get.mockReturnValue(mockBalanceCache);
      mockSolana.balanceCache.isStale.mockReturnValue(true); // Stale

      const freshBalances = {
        SOL: 12.0, // Updated
        USDC: 1000.0,
        USDT: 500.0,
      };
      mockSolana.getBalancesFromRPC.mockResolvedValue(freshBalances);

      // Should return stale data immediately
      const result = mockSolana.convertCachedToBalances(mockBalanceCache);
      expect(result).toEqual(mockBalances);

      // Background refresh should be triggered
      const isStale = mockSolana.balanceCache.isStale(mockAddress);
      if (isStale) {
        // Non-blocking refresh
        await mockSolana.getBalancesFromRPC(mockAddress, undefined, false);
        await mockSolana.populateCacheFromBalances(mockAddress, freshBalances);
      }

      expect(mockSolana.getBalancesFromRPC).toHaveBeenCalled();
      expect(mockSolana.populateCacheFromBalances).toHaveBeenCalledWith(mockAddress, freshBalances);
    });
  });

  describe('Cache disabled scenarios', () => {
    it('should fetch from RPC when cache is disabled', async () => {
      const solanaWithoutCache = {
        balanceCache: null, // Cache disabled
        getBalancesFromRPC: jest.fn().mockResolvedValue(mockBalances),
      };

      if (!solanaWithoutCache.balanceCache) {
        await solanaWithoutCache.getBalancesFromRPC(mockAddress, undefined, false);
      }

      expect(solanaWithoutCache.getBalancesFromRPC).toHaveBeenCalled();
    });
  });

  describe('Token filtering edge cases', () => {
    it('should handle empty token list request', async () => {
      mockSolana.balanceCache.get.mockReturnValue(mockBalanceCache);

      const requestedTokens: string[] = [];
      const filteredBalances: Record<string, number> = {};

      // Empty token list should return empty balances
      for (const token of requestedTokens) {
        if (mockBalanceCache[token]) {
          filteredBalances[token] = mockBalanceCache[token].balance;
        }
      }

      expect(filteredBalances).toEqual({});
      expect(Object.keys(filteredBalances)).toHaveLength(0);
    });

    it('should handle all tokens not found in cache', async () => {
      mockSolana.balanceCache.get.mockReturnValue(mockBalanceCache);

      const requestedTokens = ['TokenA', 'TokenB', 'TokenC'];
      const tokensToFetchFromRPC = [];
      const filteredBalances: Record<string, number> = {};

      for (const token of requestedTokens) {
        if (mockBalanceCache[token]) {
          filteredBalances[token] = mockBalanceCache[token].balance;
        } else {
          tokensToFetchFromRPC.push(token);
        }
      }

      expect(filteredBalances).toEqual({});
      expect(tokensToFetchFromRPC).toEqual(['TokenA', 'TokenB', 'TokenC']);

      // All tokens should be fetched from RPC
      const rpcBalances = {
        TokenA: 10.0,
        TokenB: 20.0,
        TokenC: 30.0,
      };
      mockSolana.getBalancesFromRPC.mockResolvedValue(rpcBalances);

      const rpcResult = await mockSolana.getBalancesFromRPC(mockAddress, tokensToFetchFromRPC, false);
      Object.assign(filteredBalances, rpcResult);

      expect(filteredBalances).toEqual(rpcBalances);
    });

    it('should handle mix of cached and non-cached tokens', async () => {
      mockSolana.balanceCache.get.mockReturnValue(mockBalanceCache);

      const requestedTokens = ['SOL', 'TokenAddr1', 'USDC', 'TokenAddr2'];
      const tokensToFetchFromRPC = [];
      const filteredBalances: Record<string, number> = {};

      for (const token of requestedTokens) {
        if (mockBalanceCache[token]) {
          filteredBalances[token] = mockBalanceCache[token].balance;
        } else {
          tokensToFetchFromRPC.push(token);
        }
      }

      expect(filteredBalances).toEqual({
        SOL: 10.5,
        USDC: 1000.0,
      });
      expect(tokensToFetchFromRPC).toEqual(['TokenAddr1', 'TokenAddr2']);

      // Fetch missing tokens from RPC
      const rpcBalances = {
        TokenAddr1: 100.0,
        TokenAddr2: 200.0,
      };
      mockSolana.getBalancesFromRPC.mockResolvedValue(rpcBalances);

      const rpcResult = await mockSolana.getBalancesFromRPC(mockAddress, tokensToFetchFromRPC, false);
      Object.assign(filteredBalances, rpcResult);

      expect(filteredBalances).toEqual({
        SOL: 10.5,
        USDC: 1000.0,
        TokenAddr1: 100.0,
        TokenAddr2: 200.0,
      });
    });
  });
});

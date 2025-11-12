import Fastify, { FastifyInstance } from 'fastify';

// Mock dependencies
jest.mock('../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../src/services/coingecko-service');
jest.mock('../../src/services/token-service');
jest.mock('../../src/services/chain-config');

// Mock @fastify/sensible
jest.mock('@fastify/sensible', () => {
  const plugin = jest.fn(async (fastify) => {
    fastify.decorate('httpErrors', {
      badRequest: (msg: string) => {
        const error: any = new Error(msg);
        error.statusCode = 400;
        error.name = 'BadRequestError';
        return error;
      },
      notFound: (msg: string) => {
        const error: any = new Error(msg);
        error.statusCode = 404;
        error.name = 'NotFoundError';
        return error;
      },
      internalServerError: (msg: string) => {
        const error: any = new Error(msg);
        error.statusCode = 500;
        error.name = 'InternalServerError';
        return error;
      },
    });
  });

  return {
    __esModule: true,
    default: plugin,
  };
});

// Mock Solana chain
const mockBalanceCache = {
  keys: jest.fn().mockReturnValue(['wallet1', 'wallet2']),
  set: jest.fn(),
  get: jest.fn(),
};

const mockSolana = {
  loadTokens: jest.fn().mockResolvedValue(undefined),
  getBalanceCache: jest.fn().mockReturnValue(mockBalanceCache),
  getBalances: jest.fn().mockResolvedValue({ SOL: 1.5, USDC: 100 }),
};

jest.mock('../../src/chains/solana/solana', () => ({
  Solana: {
    getInstance: jest.fn().mockResolvedValue(mockSolana),
  },
}));

// Import after mocking
import { getChainId } from '../../src/services/chain-config';
import { CoinGeckoService } from '../../src/services/coingecko-service';
import { TokenService } from '../../src/services/token-service';
import { tokensRoutes } from '../../src/tokens/tokens.routes';

describe('Token Find-Save Cache Integration Tests', () => {
  let fastify: FastifyInstance;
  let mockCoinGeckoService: jest.Mocked<CoinGeckoService>;
  let mockTokenService: jest.Mocked<TokenService>;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Create a new Fastify instance for each test
    fastify = Fastify();

    // Setup CoinGeckoService mock
    mockCoinGeckoService = {
      getTokenInfo: jest.fn(),
      getTokenInfoWithMarketData: jest.fn(),
      parseChainNetwork: jest.fn((chainNetwork: string) => {
        if (chainNetwork === 'solana-mainnet-beta') {
          return { chain: 'solana', network: 'mainnet-beta' };
        }
        throw new Error(`Unsupported chainNetwork format: ${chainNetwork}`);
      }),
    } as any;

    (CoinGeckoService.getInstance as jest.Mock).mockReturnValue(mockCoinGeckoService);

    // Setup TokenService mock
    mockTokenService = {
      getToken: jest.fn(),
      addToken: jest.fn(),
      loadTokenList: jest.fn(),
    } as any;

    (TokenService.getInstance as jest.Mock).mockReturnValue(mockTokenService);

    // Setup getChainId mock
    (getChainId as jest.Mock).mockReturnValue(101);

    // Register routes
    await fastify.register(tokensRoutes, { prefix: '/tokens' });
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('POST /tokens/save/:address - Balance Cache Integration', () => {
    it('should reload token list and refresh balances for all tracked wallets when new token is added (Solana)', async () => {
      const tokenAddress = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      const mockTokenData = {
        address: tokenAddress,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 9,
        coingeckoCoinId: 'test-token',
        imageUrl: 'https://example.com/image.png',
        priceUsd: '1.50',
        volumeUsd24h: '1000000',
        marketCapUsd: '50000000',
        fdvUsd: '75000000',
        totalSupply: '50000000',
        topPools: ['pool1', 'pool2', 'pool3'],
      };

      // Mock token doesn't exist yet
      mockTokenService.getToken.mockResolvedValue(null);
      mockCoinGeckoService.getTokenInfoWithMarketData.mockResolvedValue(mockTokenData);
      mockTokenService.addToken.mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'POST',
        url: `/tokens/save/${tokenAddress}?chainNetwork=solana-mainnet-beta`,
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.message).toContain('Token TEST has been added');
      expect(result.token.symbol).toBe('TEST');
      expect(result.token.decimals).toBe(9);

      // Verify token was added with geckoData
      expect(mockTokenService.addToken).toHaveBeenCalledWith(
        'solana',
        'mainnet-beta',
        expect.objectContaining({
          chainId: 101,
          name: 'Test Token',
          symbol: 'TEST',
          address: tokenAddress,
          decimals: 9,
          geckoData: expect.objectContaining({
            coingeckoCoinId: 'test-token',
            imageUrl: 'https://example.com/image.png',
            priceUsd: '1.50',
            volumeUsd24h: '1000000',
            marketCapUsd: '50000000',
            fdvUsd: '75000000',
            totalSupply: '50000000',
            topPools: ['pool1', 'pool2', 'pool3'],
            timestamp: expect.any(Number),
          }),
        }),
      );

      // Give async operations time to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify token list was reloaded
      expect(mockSolana.loadTokens).toHaveBeenCalled();

      // Verify balance cache was accessed
      expect(mockSolana.getBalanceCache).toHaveBeenCalled();

      // Verify keys were retrieved to get tracked wallets
      expect(mockBalanceCache.keys).toHaveBeenCalled();

      // Verify balances were refreshed for tracked wallets
      expect(mockSolana.getBalances).toHaveBeenCalledWith('wallet1');
      expect(mockSolana.getBalances).toHaveBeenCalledWith('wallet2');
    });

    it('should not refresh balances if token already exists', async () => {
      const tokenAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const existingToken = {
        chainId: 101,
        name: 'USD Coin',
        symbol: 'USDC',
        address: tokenAddress,
        decimals: 6,
      };

      const mockTokenData = {
        address: tokenAddress,
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        coingeckoCoinId: 'usd-coin',
        imageUrl: 'https://example.com/usdc.png',
        priceUsd: '1.00',
        volumeUsd24h: '10000000',
        marketCapUsd: '50000000000',
        fdvUsd: '50000000000',
        totalSupply: '50000000000',
        topPools: ['pool1', 'pool2', 'pool3'],
      };

      // Mock token already exists
      mockTokenService.getToken.mockResolvedValue(existingToken);
      mockCoinGeckoService.getTokenInfoWithMarketData.mockResolvedValue(mockTokenData);

      const response = await fastify.inject({
        method: 'POST',
        url: `/tokens/save/${tokenAddress}?chainNetwork=solana-mainnet-beta`,
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.message).toContain('already exists');

      // Verify token was NOT added
      expect(mockTokenService.addToken).not.toHaveBeenCalled();

      // Verify no balance refresh occurred
      expect(mockSolana.loadTokens).not.toHaveBeenCalled();
      expect(mockSolana.getBalances).not.toHaveBeenCalled();
    });

    it('should handle balance refresh errors gracefully', async () => {
      const tokenAddress = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      const mockTokenData = {
        address: tokenAddress,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 9,
        coingeckoCoinId: null,
        imageUrl: 'https://example.com/image.png',
        priceUsd: '0.50',
        volumeUsd24h: '100000',
        marketCapUsd: '5000000',
        fdvUsd: '10000000',
        totalSupply: '20000000',
        topPools: ['pool1'],
      };

      mockTokenService.getToken.mockResolvedValue(null);
      mockCoinGeckoService.getTokenInfoWithMarketData.mockResolvedValue(mockTokenData);
      mockTokenService.addToken.mockResolvedValue(undefined);

      // Mock balance refresh failure
      mockSolana.getBalances.mockRejectedValue(new Error('RPC error'));

      const response = await fastify.inject({
        method: 'POST',
        url: `/tokens/save/${tokenAddress}?chainNetwork=solana-mainnet-beta`,
      });

      // Should still succeed - balance refresh is non-blocking
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.message).toContain('Token TEST has been added');

      // Give async operations time to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify refresh was attempted even though it failed
      expect(mockSolana.getBalances).toHaveBeenCalled();
    });

    it('should only refresh balances for Solana chains', async () => {
      // Mock Ethereum chain (no balance refresh)
      const mockEthereum = {
        loadTokens: jest.fn(),
        getBalanceCache: jest.fn(),
      };

      jest.mock('../../src/chains/ethereum/ethereum', () => ({
        Ethereum: {
          getInstance: jest.fn().mockResolvedValue(mockEthereum),
        },
      }));

      mockCoinGeckoService.parseChainNetwork.mockReturnValue({
        chain: 'ethereum',
        network: 'mainnet',
      });

      const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const mockTokenData = {
        address: tokenAddress,
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        coingeckoCoinId: 'usd-coin',
        imageUrl: 'https://example.com/image.png',
        priceUsd: '1.00',
        volumeUsd24h: '10000000',
        marketCapUsd: '50000000000',
        fdvUsd: '50000000000',
        totalSupply: '50000000000',
        topPools: ['pool1', 'pool2', 'pool3'],
      };

      (getChainId as jest.Mock).mockReturnValue(1);
      mockTokenService.getToken.mockResolvedValue(null);
      mockCoinGeckoService.getTokenInfoWithMarketData.mockResolvedValue(mockTokenData);
      mockTokenService.addToken.mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'POST',
        url: `/tokens/save/${tokenAddress}?chainNetwork=ethereum-mainnet`,
      });

      expect(response.statusCode).toBe(200);

      // Give async operations time to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify no Solana-specific refresh occurred
      expect(mockSolana.loadTokens).not.toHaveBeenCalled();
      expect(mockSolana.getBalances).not.toHaveBeenCalled();
    });
  });
});

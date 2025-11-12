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
jest.mock('../../src/chains/solana/solana', () => ({
  Solana: {
    getInstance: jest.fn().mockResolvedValue({
      loadTokens: jest.fn().mockResolvedValue(undefined),
      getBalanceCache: jest.fn().mockReturnValue(null),
    }),
  },
}));

// Import after mocking
import { getChainId } from '../../src/services/chain-config';
import { CoinGeckoService } from '../../src/services/coingecko-service';
import { TokenService } from '../../src/services/token-service';
import { tokensRoutes } from '../../src/tokens/tokens.routes';

describe('Token GeckoData Integration Tests', () => {
  let fastify: FastifyInstance;
  let mockCoinGeckoService: jest.Mocked<CoinGeckoService>;
  let mockTokenService: jest.Mocked<TokenService>;

  // Real SOL token data from GeckoTerminal API
  const realSolTokenData = {
    address: 'So11111111111111111111111111111111111111112',
    name: 'Wrapped SOL',
    symbol: 'SOL',
    decimals: 9,
    coingeckoCoinId: 'wrapped-solana',
    imageUrl: 'https://coin-images.coingecko.com/coins/images/21629/large/solana.jpg?1696520989',
    priceUsd: '153.4740060408',
    volumeUsd24h: '5277858129.84175',
    marketCapUsd: '1983933691.24105',
    fdvUsd: '1983933691.24154',
    totalSupply: '12926838.5078424',
    topPools: [
      'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
      '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
      'Hp53XEtt4S8SvPCXarsLSdGfZBuUr5mMmZmX2DRNXQKp',
    ],
  };

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
        if (chainNetwork === 'ethereum-mainnet') {
          return { chain: 'ethereum', network: 'mainnet' };
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
    (getChainId as jest.Mock).mockImplementation((chainNetwork: string) => {
      if (chainNetwork === 'solana-mainnet-beta') return 101;
      if (chainNetwork === 'ethereum-mainnet') return 1;
      throw new Error(`Unknown chainNetwork: ${chainNetwork}`);
    });

    // Register routes
    await fastify.register(tokensRoutes, { prefix: '/tokens' });
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /tokens/find/:address - GeckoData', () => {
    it('should return token with complete geckoData for SOL token', async () => {
      mockCoinGeckoService.getTokenInfoWithMarketData.mockResolvedValue(realSolTokenData);

      const response = await fastify.inject({
        method: 'GET',
        url: `/tokens/find/${realSolTokenData.address}?chainNetwork=solana-mainnet-beta`,
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      // Verify basic token fields
      expect(result.name).toBe('Wrapped SOL');
      expect(result.symbol).toBe('SOL');
      expect(result.address).toBe('So11111111111111111111111111111111111111112');
      expect(result.decimals).toBe(9);
      expect(result.chainId).toBe(101);

      // Verify geckoData structure
      expect(result.geckoData).toBeDefined();
      expect(result.geckoData.coingeckoCoinId).toBe('wrapped-solana');
      expect(result.geckoData.imageUrl).toBe(
        'https://coin-images.coingecko.com/coins/images/21629/large/solana.jpg?1696520989',
      );
      expect(result.geckoData.priceUsd).toBe('153.4740060408');
      expect(result.geckoData.volumeUsd24h).toBe('5277858129.84175');
      expect(result.geckoData.marketCapUsd).toBe('1983933691.24105');
      expect(result.geckoData.fdvUsd).toBe('1983933691.24154');
      expect(result.geckoData.totalSupply).toBe('12926838.5078424');
      expect(result.geckoData.topPools).toEqual([
        'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
        '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
        'Hp53XEtt4S8SvPCXarsLSdGfZBuUr5mMmZmX2DRNXQKp',
      ]);
      expect(result.geckoData.timestamp).toBeGreaterThan(0);
    });

    it('should handle tokens with null coingeckoCoinId', async () => {
      const tokenDataWithNullCoinId = {
        ...realSolTokenData,
        coingeckoCoinId: null,
      };

      mockCoinGeckoService.getTokenInfoWithMarketData.mockResolvedValue(tokenDataWithNullCoinId);

      const response = await fastify.inject({
        method: 'GET',
        url: `/tokens/find/${realSolTokenData.address}?chainNetwork=solana-mainnet-beta`,
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.geckoData).toBeDefined();
      expect(result.geckoData.coingeckoCoinId).toBeNull();
    });
  });

  describe('POST /tokens/save/:address - GeckoData Persistence', () => {
    it('should save token with geckoData to token list', async () => {
      mockTokenService.getToken.mockResolvedValue(null);
      mockCoinGeckoService.getTokenInfoWithMarketData.mockResolvedValue(realSolTokenData);
      mockTokenService.addToken.mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'POST',
        url: `/tokens/save/${realSolTokenData.address}?chainNetwork=solana-mainnet-beta`,
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      // Verify the response includes geckoData
      expect(result.message).toContain('Token SOL has been added');
      expect(result.token.geckoData).toBeDefined();
      expect(result.token.geckoData.coingeckoCoinId).toBe('wrapped-solana');
      expect(result.token.geckoData.priceUsd).toBe('153.4740060408');
      expect(result.token.geckoData.topPools).toHaveLength(3);

      // Verify addToken was called with geckoData
      expect(mockTokenService.addToken).toHaveBeenCalledWith(
        'solana',
        'mainnet-beta',
        expect.objectContaining({
          chainId: 101,
          name: 'Wrapped SOL',
          symbol: 'SOL',
          address: 'So11111111111111111111111111111111111111112',
          decimals: 9,
          geckoData: expect.objectContaining({
            coingeckoCoinId: 'wrapped-solana',
            imageUrl: expect.any(String),
            priceUsd: '153.4740060408',
            volumeUsd24h: '5277858129.84175',
            marketCapUsd: '1983933691.24105',
            fdvUsd: '1983933691.24154',
            totalSupply: '12926838.5078424',
            topPools: expect.arrayContaining([
              'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
              '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
              'Hp53XEtt4S8SvPCXarsLSdGfZBuUr5mMmZmX2DRNXQKp',
            ]),
            timestamp: expect.any(Number),
          }),
        }),
      );
    });

    it('should save token with geckoData for Ethereum tokens', async () => {
      const ethUsdcData = {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        coingeckoCoinId: 'usd-coin',
        imageUrl: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png?1696506694',
        priceUsd: '0.9999975082',
        volumeUsd24h: '1236768537.13318',
        marketCapUsd: '75835134271.3412',
        fdvUsd: '8846165056.83117',
        totalSupply: '8846187100.11522',
        topPools: ['pool1', 'pool2', 'pool3'],
      };

      mockTokenService.getToken.mockResolvedValue(null);
      mockCoinGeckoService.getTokenInfoWithMarketData.mockResolvedValue(ethUsdcData);
      mockTokenService.addToken.mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'POST',
        url: `/tokens/save/${ethUsdcData.address}?chainNetwork=ethereum-mainnet`,
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.token.geckoData).toBeDefined();
      expect(result.token.geckoData.coingeckoCoinId).toBe('usd-coin');
      expect(result.token.geckoData.priceUsd).toBe('0.9999975082');

      // Verify Ethereum address is checksummed
      expect(mockTokenService.addToken).toHaveBeenCalledWith(
        'ethereum',
        'mainnet',
        expect.objectContaining({
          chainId: 1,
          symbol: 'USDC',
          // Checksummed address
          address: expect.stringMatching(/^0x[a-fA-F0-9]{40}$/),
          geckoData: expect.any(Object),
        }),
      );
    });

    it('should include timestamp in geckoData when saving', async () => {
      mockTokenService.getToken.mockResolvedValue(null);
      mockCoinGeckoService.getTokenInfoWithMarketData.mockResolvedValue(realSolTokenData);
      mockTokenService.addToken.mockResolvedValue(undefined);

      const beforeTimestamp = Date.now();

      const response = await fastify.inject({
        method: 'POST',
        url: `/tokens/save/${realSolTokenData.address}?chainNetwork=solana-mainnet-beta`,
      });

      const afterTimestamp = Date.now();

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      // Verify timestamp is recent
      expect(result.token.geckoData.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(result.token.geckoData.timestamp).toBeLessThanOrEqual(afterTimestamp);
    });
  });

  describe('GeckoData Type Safety', () => {
    it('should maintain geckoData structure through save/find cycle', async () => {
      // First, save the token
      mockTokenService.getToken.mockResolvedValue(null);
      mockCoinGeckoService.getTokenInfoWithMarketData.mockResolvedValue(realSolTokenData);
      mockTokenService.addToken.mockResolvedValue(undefined);

      const saveResponse = await fastify.inject({
        method: 'POST',
        url: `/tokens/save/${realSolTokenData.address}?chainNetwork=solana-mainnet-beta`,
      });

      expect(saveResponse.statusCode).toBe(200);
      const savedToken = JSON.parse(saveResponse.payload).token;

      // Verify all required geckoData fields are present
      expect(savedToken.geckoData).toMatchObject({
        coingeckoCoinId: expect.any(String),
        imageUrl: expect.any(String),
        priceUsd: expect.any(String),
        volumeUsd24h: expect.any(String),
        marketCapUsd: expect.any(String),
        fdvUsd: expect.any(String),
        totalSupply: expect.any(String),
        topPools: expect.any(Array),
        timestamp: expect.any(Number),
      });

      // Verify topPools is an array of strings
      expect(savedToken.geckoData.topPools.every((pool: any) => typeof pool === 'string')).toBe(true);
    });
  });
});

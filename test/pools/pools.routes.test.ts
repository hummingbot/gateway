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

jest.mock('../../src/services/pool-service');
jest.mock('../../src/services/coingecko-service');
jest.mock('../../src/services/token-service');

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

  // Return as default export
  return {
    __esModule: true,
    default: plugin,
  };
});

// Import after mocking
import { poolRoutes } from '../../src/pools/pools.routes';
import { Pool } from '../../src/pools/types';
import { CoinGeckoService } from '../../src/services/coingecko-service';
import { PoolService } from '../../src/services/pool-service';
import { TokenService } from '../../src/services/token-service';

describe('Pool Routes Tests', () => {
  let fastify: FastifyInstance;
  let mockPoolService: jest.Mocked<PoolService>;
  let mockCoinGeckoService: jest.Mocked<CoinGeckoService>;
  let mockTokenService: jest.Mocked<TokenService>;

  beforeEach(async () => {
    // Create a new Fastify instance for each test
    fastify = Fastify();

    // Setup PoolService mock
    mockPoolService = {
      listPools: jest.fn(),
      getPool: jest.fn(),
      addPool: jest.fn(),
      removePool: jest.fn(),
      updatePool: jest.fn(),
      loadPoolList: jest.fn(),
      savePoolList: jest.fn(),
      validatePool: jest.fn(),
      getPoolByAddress: jest.fn(),
      getPoolByMetadata: jest.fn(),
      getDefaultPools: jest.fn(),
    } as any;

    (PoolService.getInstance as jest.Mock).mockReturnValue(mockPoolService);

    // Setup CoinGeckoService mock
    mockCoinGeckoService = {
      getTopPoolsForToken: jest.fn(),
      getTopPoolsByNetwork: jest.fn(),
      getPoolInfo: jest.fn(),
      getTokenInfo: jest.fn(),
      mapNetworkId: jest.fn(),
      getSupportedNetworks: jest.fn(),
      parseChainNetwork: jest.fn((chainNetwork: string) => {
        // Default mock implementation for tests
        const parts = chainNetwork.split('-');
        if (parts.length < 2) {
          throw new Error(`Unsupported chainNetwork format: ${chainNetwork}`);
        }
        return {
          chain: parts[0],
          network: parts.slice(1).join('-'),
        };
      }),
    } as any;

    (CoinGeckoService.getInstance as jest.Mock).mockReturnValue(mockCoinGeckoService);

    // Setup TokenService mock
    mockTokenService = {
      getToken: jest.fn(),
      listTokens: jest.fn(),
      addToken: jest.fn(),
      removeToken: jest.fn(),
    } as any;

    (TokenService.getInstance as jest.Mock).mockReturnValue(mockTokenService);

    // Manually add httpErrors to fastify instance since we're mocking sensible
    (fastify as any).httpErrors = {
      badRequest: (msg: string) => {
        const error: any = new Error(msg);
        error.statusCode = 400;
        return error;
      },
      notFound: (msg: string) => {
        const error: any = new Error(msg);
        error.statusCode = 404;
        return error;
      },
      internalServerError: (msg: string) => {
        const error: any = new Error(msg);
        error.statusCode = 500;
        return error;
      },
    };

    // Set a global error handler to properly handle errors from routes
    fastify.setErrorHandler((error, _request, reply) => {
      reply.status(error.statusCode || 500).send({
        message: error.message,
        statusCode: error.statusCode || 500,
      });
    });

    // Register the pool routes plugin
    await fastify.register(poolRoutes);

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /pools', () => {
    it('should list all pools for a connector', async () => {
      const mockPools: Pool[] = [
        {
          type: 'amm',
          network: 'mainnet-beta',
          baseSymbol: 'SOL',
          quoteSymbol: 'USDC',
          baseTokenAddress: 'So11111111111111111111111111111111111111112',
          quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          feePct: 0.25,
          address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        },
        {
          type: 'amm',
          network: 'mainnet-beta',
          baseSymbol: 'RAY',
          quoteSymbol: 'USDC',
          baseTokenAddress: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
          quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          feePct: 0.25,
          address: '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
        },
      ];

      mockPoolService.listPools.mockResolvedValue(mockPools);

      const response = await fastify.inject({
        method: 'GET',
        url: '/?connector=raydium&network=mainnet-beta',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(mockPools);
      expect(mockPoolService.listPools).toHaveBeenCalledWith('raydium', 'mainnet-beta', undefined, undefined);
    });

    it('should filter pools by type', async () => {
      const mockPools: Pool[] = [
        {
          type: 'clmm',
          network: 'mainnet-beta',
          baseSymbol: 'SOL',
          quoteSymbol: 'USDC',
          baseTokenAddress: 'So11111111111111111111111111111111111111112',
          quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          feePct: 0.25,
          address: '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
        },
      ];

      mockPoolService.listPools.mockResolvedValue(mockPools);

      const response = await fastify.inject({
        method: 'GET',
        url: '/?connector=raydium&network=mainnet-beta&type=clmm',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(mockPools);
      expect(mockPoolService.listPools).toHaveBeenCalledWith('raydium', 'mainnet-beta', 'clmm', undefined);
    });

    it('should search pools by token symbol', async () => {
      const mockPools: Pool[] = [
        {
          type: 'amm',
          network: 'mainnet-beta',
          baseSymbol: 'SOL',
          quoteSymbol: 'USDC',
          baseTokenAddress: 'So11111111111111111111111111111111111111112',
          quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          feePct: 0.25,
          address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        },
      ];

      mockPoolService.listPools.mockResolvedValue(mockPools);

      const response = await fastify.inject({
        method: 'GET',
        url: '/?connector=raydium&search=SOL',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(mockPools);
      expect(mockPoolService.listPools).toHaveBeenCalledWith('raydium', undefined, undefined, 'SOL');
    });

    it('should return 400 for invalid parameters', async () => {
      mockPoolService.listPools.mockRejectedValue(new Error('Invalid connector name'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/?connector=invalid&network=mainnet',
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toHaveProperty('message');
    });
  });

  describe('GET /pools/:tradingPair', () => {
    it('should find pool by trading pair', async () => {
      const mockPool: Pool = {
        type: 'amm',
        network: 'mainnet-beta',
        baseSymbol: 'SOL',
        quoteSymbol: 'USDC',
        baseTokenAddress: 'So11111111111111111111111111111111111111112',
        quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        feePct: 0.25,
        address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      };

      mockPoolService.getPool.mockResolvedValue(mockPool);

      const response = await fastify.inject({
        method: 'GET',
        url: '/SOL-USDC?connector=raydium&network=mainnet-beta&type=amm',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(mockPool);
      expect(mockPoolService.getPool).toHaveBeenCalledWith('raydium', 'mainnet-beta', 'amm', 'SOL', 'USDC');
    });

    it('should return 404 if pool not found', async () => {
      mockPoolService.getPool.mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'GET',
        url: '/UNKNOWN-TOKEN?connector=raydium&network=mainnet-beta&type=amm',
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload)).toHaveProperty('message');
    });

    it('should return 400 for invalid trading pair format', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/INVALIDFORMAT?connector=raydium&network=mainnet-beta&type=amm',
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toHaveProperty('message');
      expect(JSON.parse(response.payload).message).toContain('Invalid trading pair format');
    });
  });

  describe('POST /pools', () => {
    it('should add new pool successfully', async () => {
      mockPoolService.addPool.mockResolvedValue(undefined);
      mockPoolService.getPoolByMetadata.mockResolvedValue(null);
      mockPoolService.getPoolByAddress.mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: {
          connector: 'raydium',
          type: 'amm',
          network: 'mainnet-beta',
          baseSymbol: 'WIF',
          quoteSymbol: 'SOL',
          address: 'EP2ib6dYdEeqD8MfE2ezHCxX3kP3K2eLKkirfPm5eyMx',
          baseTokenAddress: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
          quoteTokenAddress: 'So11111111111111111111111111111111111111112',
          feePct: 0.25,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toHaveProperty('message');
      expect(JSON.parse(response.payload).message).toContain('Pool WIF-SOL');

      // Verify addPool was called with pool data
      expect(mockPoolService.addPool).toHaveBeenCalledWith(
        'raydium',
        expect.objectContaining({
          type: 'amm',
          network: 'mainnet-beta',
          baseSymbol: 'WIF',
          quoteSymbol: 'SOL',
          address: 'EP2ib6dYdEeqD8MfE2ezHCxX3kP3K2eLKkirfPm5eyMx',
          baseTokenAddress: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
          quoteTokenAddress: 'So11111111111111111111111111111111111111112',
          feePct: 0.25,
        }),
      );
    });

    it('should update existing pool with same address', async () => {
      mockPoolService.getPoolByMetadata.mockResolvedValue(null);
      mockPoolService.getPoolByAddress.mockResolvedValue({
        type: 'amm',
        network: 'mainnet-beta',
        baseSymbol: 'SOL',
        quoteSymbol: 'USDC',
        baseTokenAddress: 'So11111111111111111111111111111111111111112',
        quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        feePct: 0.25,
        address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      });
      mockPoolService.updatePool.mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: {
          connector: 'raydium',
          type: 'amm',
          network: 'mainnet-beta',
          baseSymbol: 'SOL',
          quoteSymbol: 'USDC',
          address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
          baseTokenAddress: 'So11111111111111111111111111111111111111112',
          quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          feePct: 0.3,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toHaveProperty('message');
      expect(mockPoolService.updatePool).toHaveBeenCalled();
    });

    it('should return 400 for missing required fields', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: {
          connector: 'raydium',
          network: 'mainnet-beta',
          // Missing other required fields
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /pools/:address', () => {
    it('should remove pool successfully', async () => {
      mockPoolService.removePool.mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2?connector=raydium&network=mainnet-beta&type=amm',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toHaveProperty('message');
      expect(JSON.parse(response.payload).message).toContain('Pool with address');

      expect(mockPoolService.removePool).toHaveBeenCalledWith(
        'raydium',
        'mainnet-beta',
        'amm',
        '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      );
    });

    it('should return 404 if pool not found', async () => {
      mockPoolService.removePool.mockRejectedValue(new Error('Pool with address NonExistent not found'));

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/NonExistent?connector=raydium&network=mainnet-beta&type=amm',
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload)).toHaveProperty('message');
    });

    it('should return 400 for missing required parameters', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2?connector=raydium',
        // Missing network and type
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /pools/find', () => {
    it('should find pools for token pair by symbols', async () => {
      const mockPools = [
        {
          poolAddress: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
          dex: 'raydium',
          connector: 'raydium',
          type: 'amm' as const,
          baseTokenAddress: 'So11111111111111111111111111111111111111112',
          quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          priceUsd: '100.50',
          priceNative: '1',
          volumeUsd24h: '1000000',
          priceChange24h: '5.2',
          liquidityUsd: '5000000',
          txns24h: {
            buys: 150,
            sells: 120,
          },
        },
        {
          poolAddress: '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
          dex: 'raydium-clmm',
          connector: 'raydium',
          type: 'clmm' as const,
          baseTokenAddress: 'So11111111111111111111111111111111111111112',
          quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          priceUsd: '100.52',
          priceNative: '1',
          volumeUsd24h: '2000000',
          priceChange24h: '5.3',
          liquidityUsd: '8000000',
          txns24h: {
            buys: 200,
            sells: 180,
          },
        },
      ];

      mockTokenService.getToken
        .mockResolvedValueOnce({
          chainId: 101,
          symbol: 'SOL',
          address: 'So11111111111111111111111111111111111111112',
          name: 'Solana',
          decimals: 9,
        })
        .mockResolvedValueOnce({
          chainId: 101,
          symbol: 'USDC',
          address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          name: 'USD Coin',
          decimals: 6,
        });

      mockCoinGeckoService.getTopPoolsForToken.mockResolvedValue(mockPools);

      const response = await fastify.inject({
        method: 'GET',
        url: '/find?tokenA=SOL&tokenB=USDC&chainNetwork=solana-mainnet-beta&type=clmm',
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      // Verify response is in PoolInfo format with geckoData
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        type: 'amm',
        network: 'mainnet-beta',
        baseSymbol: 'SOL',
        quoteSymbol: 'USDC',
        baseTokenAddress: 'So11111111111111111111111111111111111111112',
        quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        geckoData: expect.objectContaining({
          volumeUsd24h: '1000000',
          liquidityUsd: '5000000',
          priceUsd: '100.50',
          priceNative: '1',
          buys24h: 150,
          sells24h: 120,
          timestamp: expect.any(Number),
        }),
      });
      expect(result[1]).toMatchObject({
        type: 'clmm',
        network: 'mainnet-beta',
        baseSymbol: 'SOL',
        quoteSymbol: 'USDC',
        geckoData: expect.objectContaining({
          volumeUsd24h: '2000000',
          liquidityUsd: '8000000',
        }),
      });

      expect(mockTokenService.getToken).toHaveBeenCalledWith('solana', 'mainnet-beta', 'SOL');
      expect(mockTokenService.getToken).toHaveBeenCalledWith('solana', 'mainnet-beta', 'USDC');
      expect(mockCoinGeckoService.getTopPoolsForToken).toHaveBeenCalledWith(
        'solana-mainnet-beta',
        'So11111111111111111111111111111111111111112',
        10, // maxPages (default)
        undefined,
        'clmm',
      );
    });

    it('should find pools by addresses', async () => {
      const mockPools = [
        {
          poolAddress: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
          dex: 'raydium',
          connector: 'raydium',
          type: 'amm' as const,
          baseTokenAddress: 'So11111111111111111111111111111111111111112',
          quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          priceUsd: '100.50',
          priceNative: '1',
          volumeUsd24h: '1000000',
          priceChange24h: '5.2',
          liquidityUsd: '5000000',
          txns24h: {
            buys: 150,
            sells: 120,
          },
        },
      ];

      mockCoinGeckoService.getTopPoolsForToken.mockResolvedValue(mockPools);

      // Mock getToken to return null for addresses (not found in token list)
      mockTokenService.getToken.mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'GET',
        url: '/find?tokenA=So11111111111111111111111111111111111111112&tokenB=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&chainNetwork=solana-mainnet-beta',
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      // Verify response is in PoolInfo format with geckoData
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'amm',
        network: 'mainnet-beta',
        baseSymbol: 'SOL',
        quoteSymbol: 'USDC',
        baseTokenAddress: 'So11111111111111111111111111111111111111112',
        quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        geckoData: expect.objectContaining({
          volumeUsd24h: '1000000',
          liquidityUsd: '5000000',
        }),
      });

      // Should call getToken to check token list, but both return null (addresses not in list)
      expect(mockTokenService.getToken).toHaveBeenCalledWith(
        'solana',
        'mainnet-beta',
        'So11111111111111111111111111111111111111112',
      );
      expect(mockTokenService.getToken).toHaveBeenCalledWith(
        'solana',
        'mainnet-beta',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      );
    });

    it('should filter by connector', async () => {
      const mockPools = [
        {
          poolAddress: '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
          dex: 'raydium-clmm',
          connector: 'raydium',
          type: 'clmm' as const,
          baseTokenAddress: 'So11111111111111111111111111111111111111112',
          quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          priceUsd: '100.52',
          priceNative: '1',
          volumeUsd24h: '2000000',
          priceChange24h: '5.3',
          liquidityUsd: '8000000',
          txns24h: {
            buys: 200,
            sells: 180,
          },
        },
      ];

      mockCoinGeckoService.getTopPoolsForToken.mockResolvedValue(mockPools);

      const response = await fastify.inject({
        method: 'GET',
        url: '/find?tokenA=So11111111111111111111111111111111111111112&tokenB=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&chainNetwork=solana-mainnet-beta&connector=raydium',
      });

      expect(response.statusCode).toBe(200);
      expect(mockCoinGeckoService.getTopPoolsForToken).toHaveBeenCalledWith(
        'solana-mainnet-beta',
        'So11111111111111111111111111111111111111112',
        10, // default maxPages
        'raydium',
        'clmm', // default type
      );
    });

    it('should return empty array when no pools found', async () => {
      mockCoinGeckoService.getTopPoolsForToken.mockResolvedValue([]);

      const response = await fastify.inject({
        method: 'GET',
        url: '/find?tokenA=So11111111111111111111111111111111111111112&tokenB=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&chainNetwork=solana-mainnet-beta',
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result).toEqual([]);
    });

    it('should return top pools by network when neither tokenA nor tokenB is provided', async () => {
      const mockPools = [
        {
          poolAddress: '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
          dex: 'raydium-clmm',
          connector: 'raydium',
          type: 'clmm' as const,
          baseTokenAddress: 'So11111111111111111111111111111111111111112',
          quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          priceUsd: '100.52',
          priceNative: '1',
          volumeUsd24h: '2000000',
          priceChange24h: '5.3',
          liquidityUsd: '8000000',
          txns24h: {
            buys: 200,
            sells: 180,
          },
        },
      ];

      mockCoinGeckoService.getTopPoolsByNetwork.mockResolvedValue(mockPools);

      const response = await fastify.inject({
        method: 'GET',
        url: '/find?chainNetwork=solana-mainnet-beta',
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      // Verify response is in PoolInfo format with geckoData
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'clmm',
        network: 'mainnet-beta',
        baseSymbol: 'SOL',
        quoteSymbol: 'USDC',
        baseTokenAddress: 'So11111111111111111111111111111111111111112',
        quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        address: '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
        geckoData: expect.objectContaining({
          volumeUsd24h: '2000000',
          liquidityUsd: '8000000',
          priceUsd: '100.52',
          priceNative: '1',
          buys24h: 200,
          sells24h: 180,
          timestamp: expect.any(Number),
        }),
      });

      expect(mockCoinGeckoService.getTopPoolsByNetwork).toHaveBeenCalledWith(
        'solana-mainnet-beta',
        10, // default maxPages
        undefined, // no connector filter
        'clmm', // default type
      );
    });

    it('should return 400 for invalid chainNetwork format', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/find?tokenA=SOL&tokenB=USDC&chainNetwork=invalid',
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload).message).toContain('Unsupported chainNetwork format');
    });

    it('should return 500 on service error', async () => {
      mockCoinGeckoService.getTopPoolsForToken.mockRejectedValue(new Error('API error'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/find?tokenA=So11111111111111111111111111111111111111112&tokenB=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&chainNetwork=solana-mainnet-beta',
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.payload).message).toContain('Failed to fetch pools from GeckoTerminal');
    });
  });
});

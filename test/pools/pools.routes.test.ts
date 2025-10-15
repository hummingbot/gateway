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
import { PoolService } from '../../src/services/pool-service';

describe('Pool Routes Tests', () => {
  let fastify: FastifyInstance;
  let mockPoolService: jest.Mocked<PoolService>;

  beforeEach(async () => {
    // Create a new Fastify instance for each test
    fastify = Fastify();

    // Setup PoolService mock
    mockPoolService = {
      listPools: jest.fn(),
      getPool: jest.fn(),
      addPool: jest.fn(),
      removePool: jest.fn(),
      loadPoolList: jest.fn(),
      savePoolList: jest.fn(),
      validatePool: jest.fn(),
      getPoolByAddress: jest.fn(),
      getDefaultPools: jest.fn(),
    } as any;

    (PoolService.getInstance as jest.Mock).mockReturnValue(mockPoolService);

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
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toHaveProperty('message');
      expect(JSON.parse(response.payload).message).toContain('Pool WIF-SOL added successfully');

      // Verify addPool was called with enhanced pool data from pool-info
      expect(mockPoolService.addPool).toHaveBeenCalledWith(
        'raydium',
        expect.objectContaining({
          type: 'amm',
          network: 'mainnet-beta',
          baseSymbol: 'WIF',
          quoteSymbol: 'SOL',
          address: 'EP2ib6dYdEeqD8MfE2ezHCxX3kP3K2eLKkirfPm5eyMx',
          baseTokenAddress: expect.any(String),
          quoteTokenAddress: expect.any(String),
          feePct: expect.any(Number),
        }),
      );
    });

    it('should return 400 for duplicate pool', async () => {
      mockPoolService.addPool.mockRejectedValue(new Error('Pool with address already exists'));

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
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toHaveProperty('message');
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
});

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
import { PoolService } from '../../src/services/pool-service';
import { Pool } from '../../src/pools/types';

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
    it('should list all pools for a chain/network', async () => {
      const mockPools: Pool[] = [
        {
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/amm',
          network: 'mainnet-beta',
          address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        },
        {
          baseTokenSymbol: 'RAY',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/amm',
          network: 'mainnet-beta',
          address: '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
        },
      ];

      mockPoolService.listPools.mockResolvedValue(mockPools);

      const response = await fastify.inject({
        method: 'GET',
        url: '/?chain=solana&network=mainnet-beta',
      });


      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(mockPools);
      expect(mockPoolService.listPools).toHaveBeenCalledWith(
        'solana',
        'mainnet-beta',
        undefined,
        undefined,
      );
    });

    it('should filter pools by connector', async () => {
      const mockPools: Pool[] = [
        {
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/clmm',
          network: 'mainnet-beta',
          address: '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
        },
      ];

      mockPoolService.listPools.mockResolvedValue(mockPools);

      const response = await fastify.inject({
        method: 'GET',
        url: '/?chain=solana&network=mainnet-beta&connector=raydium/clmm',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(mockPools);
      expect(mockPoolService.listPools).toHaveBeenCalledWith(
        'solana',
        'mainnet-beta',
        'raydium/clmm',
        undefined,
      );
    });

    it('should search pools by token symbol', async () => {
      const mockPools: Pool[] = [
        {
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/amm',
          network: 'mainnet-beta',
          address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        },
      ];

      mockPoolService.listPools.mockResolvedValue(mockPools);

      const response = await fastify.inject({
        method: 'GET',
        url: '/?chain=solana&network=mainnet-beta&search=SOL',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(mockPools);
      expect(mockPoolService.listPools).toHaveBeenCalledWith(
        'solana',
        'mainnet-beta',
        undefined,
        'SOL',
      );
    });

    it('should return 400 for invalid parameters', async () => {
      mockPoolService.listPools.mockRejectedValue(
        new Error('Invalid chain name'),
      );

      const response = await fastify.inject({
        method: 'GET',
        url: '/?chain=invalid&network=mainnet',
      });


      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toHaveProperty('message');
    });
  });

  describe('GET /pools/find', () => {
    it('should find pool by token pair', async () => {
      const mockPool: Pool = {
        baseTokenSymbol: 'SOL',
        quoteTokenSymbol: 'USDC',
        connector: 'raydium/amm',
        network: 'mainnet-beta',
        address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      };

      mockPoolService.getPool.mockResolvedValue(mockPool);

      const response = await fastify.inject({
        method: 'GET',
        url: '/find?chain=solana&network=mainnet-beta&connector=raydium/amm&tokenPair=SOL-USDC',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(mockPool);
      expect(mockPoolService.getPool).toHaveBeenCalledWith(
        'solana',
        'mainnet-beta',
        'raydium/amm',
        'SOL',
        'USDC',
      );
    });

    it('should return 404 if pool not found', async () => {
      mockPoolService.getPool.mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'GET',
        url: '/find?chain=solana&network=mainnet-beta&connector=raydium/amm&tokenPair=UNKNOWN-TOKEN',
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload)).toHaveProperty('message');
    });

    it('should return 400 for invalid token pair format', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/find?chain=solana&network=mainnet-beta&connector=raydium/amm&tokenPair=INVALIDFORMAT',
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toHaveProperty('message');
      expect(JSON.parse(response.payload).message).toContain(
        'Invalid token pair format',
      );
    });
  });

  describe('POST /pools', () => {
    it('should add new pool successfully', async () => {
      mockPoolService.addPool.mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: {
          chain: 'solana',
          network: 'mainnet-beta',
          baseTokenSymbol: 'WIF',
          quoteTokenSymbol: 'SOL',
          connector: 'raydium/amm',
          address: 'EP2ib6dYdEeqD8MfE2ezHCxX3kP3K2eLKkirfPm5eyMx',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toHaveProperty('message');
      expect(JSON.parse(response.payload).message).toContain(
        'Pool WIF-SOL added successfully',
      );

      expect(mockPoolService.addPool).toHaveBeenCalledWith(
        'solana',
        'mainnet-beta',
        {
          baseTokenSymbol: 'WIF',
          quoteTokenSymbol: 'SOL',
          connector: 'raydium/amm',
          network: 'mainnet-beta',
          address: 'EP2ib6dYdEeqD8MfE2ezHCxX3kP3K2eLKkirfPm5eyMx',
        },
      );
    });

    it('should return 400 for duplicate pool', async () => {
      mockPoolService.addPool.mockRejectedValue(
        new Error('Pool with address already exists'),
      );

      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: {
          chain: 'solana',
          network: 'mainnet-beta',
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/amm',
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
          chain: 'solana',
          network: 'mainnet-beta',
          // Missing other required fields
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /pools', () => {
    it('should remove pool successfully', async () => {
      mockPoolService.removePool.mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/',
        payload: {
          chain: 'solana',
          network: 'mainnet-beta',
          connector: 'raydium/amm',
          address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toHaveProperty('message');
      expect(JSON.parse(response.payload).message).toContain(
        'Pool with address',
      );

      expect(mockPoolService.removePool).toHaveBeenCalledWith(
        'solana',
        'mainnet-beta',
        'raydium/amm',
        '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      );
    });

    it('should return 404 if pool not found', async () => {
      mockPoolService.removePool.mockRejectedValue(
        new Error('Pool with address NonExistent not found'),
      );

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/',
        payload: {
          chain: 'solana',
          network: 'mainnet-beta',
          connector: 'raydium/amm',
          address: 'NonExistent',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload)).toHaveProperty('message');
    });

    it('should return 400 for missing required fields', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/',
        payload: {
          chain: 'solana',
          // Missing other required fields
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
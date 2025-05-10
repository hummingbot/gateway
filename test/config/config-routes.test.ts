import Fastify, { FastifyInstance } from 'fastify';

// Mock dependencies
jest.mock('../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));
jest.mock('../../src/config/utils');

// Import after mocking
import { getDefaultPools, addDefaultPool, removeDefaultPool } from '../../src/config/utils';
import { configRoutes } from '../../src/config/config.routes';

// Remove duplicate mock declaration

describe('Config Routes Tests', () => {
  let fastify: FastifyInstance;

  // Sample pool data for testing
  const ammPools = {
    'SOL-USDC': '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
    'RAY-USDC': '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg'
  };

  const clmmPools = {
    'SOL-USDC': '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
    'RAY-USDC': '61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht'
  };

  beforeEach(async () => {
    // Create a new Fastify instance for each test
    fastify = Fastify();
    
    // Register the config routes plugin
    await fastify.register(configRoutes);
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock implementations
    (getDefaultPools as jest.Mock).mockImplementation((_fastify, connector) => {
      if (connector === 'raydium/amm') return ammPools;
      if (connector === 'raydium/clmm') return clmmPools;
      return {};
    });
    
    (addDefaultPool as jest.Mock).mockImplementation(() => {});
    (removeDefaultPool as jest.Mock).mockImplementation(() => {});
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /pools', () => {
    it('should return pools for raydium/amm', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/pools?connector=raydium/amm'
      });
      
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(ammPools);
      expect(getDefaultPools).toHaveBeenCalledWith(expect.anything(), 'raydium/amm');
    });

    it('should return pools for raydium/clmm', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/pools?connector=raydium/clmm'
      });
      
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(clmmPools);
      expect(getDefaultPools).toHaveBeenCalledWith(expect.anything(), 'raydium/clmm');
    });

    it('should return empty object for unknown connector', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/pools?connector=unknown/amm'
      });
      
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({});
    });

    it('should return 400 if connector parameter is missing', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/pools'
      });
      
      expect(response.statusCode).toBe(400);
    });

    it('should return 500 if getDefaultPools throws an error', async () => {
      (getDefaultPools as jest.Mock).mockImplementation(() => {
        throw new Error('Test error');
      });
      
      const response = await fastify.inject({
        method: 'GET',
        url: '/pools?connector=raydium/amm'
      });
      
      expect(response.statusCode).toBe(500);
    });
  });

  describe('POST /pools/add', () => {
    it('should add a pool and return success message', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/pools/add',
        payload: {
          connector: 'raydium/amm',
          baseToken: 'SOL',
          quoteToken: 'USDC',
          poolAddress: 'new-pool-address'
        }
      });
      
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: 'Default pool added for SOL-USDC'
      });
      
      expect(addDefaultPool).toHaveBeenCalledWith(
        expect.anything(),
        'raydium/amm',
        'SOL',
        'USDC',
        'new-pool-address'
      );
    });

    it('should return 400 if required parameters are missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/pools/add',
        payload: {
          connector: 'raydium/amm',
          baseToken: 'SOL'
          // Missing quoteToken and poolAddress
        }
      });
      
      expect(response.statusCode).toBe(400);
    });

    it('should return 500 if addDefaultPool throws an error', async () => {
      (addDefaultPool as jest.Mock).mockImplementation(() => {
        throw new Error('Test error');
      });
      
      const response = await fastify.inject({
        method: 'POST',
        url: '/pools/add',
        payload: {
          connector: 'raydium/amm',
          baseToken: 'SOL',
          quoteToken: 'USDC',
          poolAddress: 'new-pool-address'
        }
      });
      
      expect(response.statusCode).toBe(500);
    });
  });

  describe('POST /pools/remove', () => {
    it('should remove a pool and return success message', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/pools/remove',
        payload: {
          connector: 'raydium/amm',
          baseToken: 'SOL',
          quoteToken: 'USDC'
        }
      });
      
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: 'Default pool removed for SOL-USDC'
      });
      
      expect(removeDefaultPool).toHaveBeenCalledWith(
        expect.anything(),
        'raydium/amm',
        'SOL',
        'USDC'
      );
    });

    it('should return 400 if required parameters are missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/pools/remove',
        payload: {
          connector: 'raydium/amm'
          // Missing baseToken and quoteToken
        }
      });
      
      expect(response.statusCode).toBe(400);
    });

    it('should return 500 if removeDefaultPool throws an error', async () => {
      (removeDefaultPool as jest.Mock).mockImplementation(() => {
        throw new Error('Test error');
      });
      
      const response = await fastify.inject({
        method: 'POST',
        url: '/pools/remove',
        payload: {
          connector: 'raydium/amm',
          baseToken: 'SOL',
          quoteToken: 'USDC'
        }
      });
      
      expect(response.statusCode).toBe(500);
    });
  });
});
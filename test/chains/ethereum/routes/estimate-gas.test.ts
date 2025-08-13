import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { Ethereum } from '../../../../src/chains/ethereum/ethereum';

// Mock the Ethereum class
jest.mock('../../../../src/chains/ethereum/ethereum');

const mockEthereum = Ethereum as jest.Mocked<typeof Ethereum>;

describe('Ethereum Estimate Gas Route', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /chains/ethereum/estimate-gas', () => {
    const mockInstance = {
      estimateGasPrice: jest.fn(),
      minGasPrice: 1.5,
    };

    beforeEach(() => {
      mockEthereum.getInstance.mockResolvedValue(mockInstance as any);
    });

    it('should return gas price successfully from live estimation', async () => {
      mockInstance.estimateGasPrice.mockResolvedValue(15.5);

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/ethereum/estimate-gas?network=mainnet',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toMatchObject({
        feePerComputeUnit: 15.5,
        denomination: 'gwei',
        timestamp: expect.any(Number),
      });

      expect(mockEthereum.getInstance).toHaveBeenCalledWith('mainnet');
      expect(mockInstance.estimateGasPrice).toHaveBeenCalled();
    });

    it('should return minGasPrice when gas estimation fails but instance is available', async () => {
      // First call for gas estimation fails
      mockInstance.estimateGasPrice.mockRejectedValueOnce(new Error('RPC node unavailable'));

      // Second getInstance call for fallback succeeds
      mockEthereum.getInstance
        .mockResolvedValueOnce(mockInstance as any) // First call in try block fails during estimateGasPrice
        .mockResolvedValueOnce(mockInstance as any); // Second call in catch block succeeds

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/ethereum/estimate-gas?network=sepolia',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toMatchObject({
        feePerComputeUnit: 1.5, // minGasPrice from mock instance
        denomination: 'gwei',
        timestamp: expect.any(Number),
      });

      expect(mockEthereum.getInstance).toHaveBeenCalledTimes(2);
      expect(mockEthereum.getInstance).toHaveBeenCalledWith('sepolia');
    });

    it('should work with different networks', async () => {
      const networks = ['mainnet', 'sepolia', 'arbitrum', 'polygon'];

      for (const network of networks) {
        jest.clearAllMocks(); // Clear mocks between iterations
        mockInstance.estimateGasPrice.mockResolvedValue(10.0);
        mockEthereum.getInstance.mockResolvedValue(mockInstance as any);

        const response = await fastify.inject({
          method: 'GET',
          url: `/chains/ethereum/estimate-gas?network=${network}`,
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.body);

        expect(data).toMatchObject({
          feePerComputeUnit: 10.0,
          denomination: 'gwei',
          timestamp: expect.any(Number),
        });

        expect(mockEthereum.getInstance).toHaveBeenCalledWith(network);
      }
    });

    it('should return consistent response format', async () => {
      mockInstance.estimateGasPrice.mockResolvedValue(5.25);

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/ethereum/estimate-gas?network=mainnet',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      // Verify response schema
      expect(typeof data.feePerComputeUnit).toBe('number');
      expect(data.denomination).toBe('gwei');
      expect(typeof data.timestamp).toBe('number');
      expect(data.timestamp).toBeGreaterThan(Date.now() - 5000); // Recent timestamp
    });

    it('should handle missing network parameter by using default', async () => {
      mockInstance.estimateGasPrice.mockResolvedValue(12.0);

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/ethereum/estimate-gas',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toMatchObject({
        feePerComputeUnit: 12.0,
        denomination: 'gwei',
        timestamp: expect.any(Number),
      });
    });
  });
});

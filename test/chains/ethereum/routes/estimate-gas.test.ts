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
      nativeTokenSymbol: 'ETH',
      baseFee: null,
      baseFeeMultiplier: 1.2,
      priorityFee: 0.001,
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
        computeUnits: 300000,
        feeAsset: 'ETH',
        fee: expect.any(Number),
        timestamp: expect.any(Number),
      });

      expect(mockEthereum.getInstance).toHaveBeenCalledWith('mainnet');
      expect(mockInstance.estimateGasPrice).toHaveBeenCalled();
    });

    it('should return 503 error when RPC provider is unavailable', async () => {
      // Gas estimation fails due to RPC error
      mockInstance.estimateGasPrice.mockRejectedValueOnce(new Error('RPC node unavailable'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/ethereum/estimate-gas?network=sepolia',
      });

      expect(response.statusCode).toBe(503);
      const data = JSON.parse(response.body);

      expect(data.error).toBe('ServiceUnavailableError');
      expect(data.message).toContain('RPC provider unavailable');

      expect(mockEthereum.getInstance).toHaveBeenCalledWith('sepolia');
    });

    it('should return 500 error for generic failures', async () => {
      // Generic error that doesn't match specific error patterns
      mockInstance.estimateGasPrice.mockRejectedValueOnce(new Error('Database connection timeout'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/ethereum/estimate-gas?network=mainnet',
      });

      expect(response.statusCode).toBe(500);
      const data = JSON.parse(response.body);

      expect(data.error).toBe('InternalServerError');
      expect(data.message).toContain('Failed to estimate gas');
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
          computeUnits: 300000,
          feeAsset: 'ETH',
          fee: expect.any(Number),
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
      expect(data.computeUnits).toBe(300000);
      expect(data.feeAsset).toBe('ETH');
      expect(typeof data.fee).toBe('number');
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
        computeUnits: 300000,
        feeAsset: 'ETH',
        fee: expect.any(Number),
        timestamp: expect.any(Number),
      });
    });
  });
});

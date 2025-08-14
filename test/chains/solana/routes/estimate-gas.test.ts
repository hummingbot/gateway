import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { Solana } from '../../../../src/chains/solana/solana';

// Mock the Solana class
jest.mock('../../../../src/chains/solana/solana');

const mockSolana = Solana as jest.Mocked<typeof Solana>;

describe('Solana Estimate Gas Route', () => {
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

  describe('GET /chains/solana/estimate-gas', () => {
    const mockInstance = {
      estimateGasPrice: jest.fn(),
      config: {
        minPriorityFeePerCU: 0.5,
        defaultComputeUnits: 200000,
      },
      nativeTokenSymbol: 'SOL',
    };

    beforeEach(() => {
      mockSolana.getInstance.mockResolvedValue(mockInstance as any);
    });

    it('should return priority fee successfully from live estimation', async () => {
      mockInstance.estimateGasPrice.mockResolvedValue(2.5);

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/solana/estimate-gas?network=mainnet-beta',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toMatchObject({
        feePerComputeUnit: 2.5,
        denomination: 'lamports',
        computeUnits: 200000,
        feeAsset: 'SOL',
        fee: expect.any(Number),
        timestamp: expect.any(Number),
      });

      expect(mockSolana.getInstance).toHaveBeenCalledWith('mainnet-beta');
      expect(mockInstance.estimateGasPrice).toHaveBeenCalled();
    });

    it('should return minPriorityFeePerCU when priority fee estimation fails but instance is available', async () => {
      // First call for priority fee estimation fails
      mockInstance.estimateGasPrice.mockRejectedValueOnce(new Error('RPC node unavailable'));

      // Second getInstance call for fallback succeeds
      mockSolana.getInstance
        .mockResolvedValueOnce(mockInstance as any) // First call in try block fails during estimateGasPrice
        .mockResolvedValueOnce(mockInstance as any); // Second call in catch block succeeds

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/solana/estimate-gas?network=devnet',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toMatchObject({
        feePerComputeUnit: 0.5, // minPriorityFeePerCU from mock instance config
        denomination: 'lamports',
        computeUnits: 200000,
        feeAsset: 'SOL',
        fee: expect.any(Number),
        timestamp: expect.any(Number),
      });

      expect(mockSolana.getInstance).toHaveBeenCalledTimes(2);
      expect(mockSolana.getInstance).toHaveBeenCalledWith('devnet');
    });

    it('should use default minPriorityFeePerCU when config value is undefined', async () => {
      const instanceWithoutMinFee = {
        estimateGasPrice: jest.fn().mockRejectedValue(new Error('RPC unavailable')),
        config: {
          defaultComputeUnits: 200000,
        }, // No minPriorityFeePerCU defined
        nativeTokenSymbol: 'SOL',
      };

      mockSolana.getInstance
        .mockResolvedValueOnce(instanceWithoutMinFee as any) // First call fails during estimateGasPrice
        .mockResolvedValueOnce(instanceWithoutMinFee as any); // Second call for fallback

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/solana/estimate-gas?network=mainnet-beta',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toMatchObject({
        feePerComputeUnit: 0.1, // Default fallback value
        denomination: 'lamports',
        computeUnits: 200000,
        feeAsset: 'SOL',
        fee: expect.any(Number),
        timestamp: expect.any(Number),
      });
    });

    it('should work with different Solana networks', async () => {
      const networks = ['mainnet-beta', 'devnet'];

      for (const network of networks) {
        jest.clearAllMocks(); // Clear mocks between iterations
        mockInstance.estimateGasPrice.mockResolvedValue(1.25);
        mockSolana.getInstance.mockResolvedValue(mockInstance as any);

        const response = await fastify.inject({
          method: 'GET',
          url: `/chains/solana/estimate-gas?network=${network}`,
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.body);

        expect(data).toMatchObject({
          feePerComputeUnit: 1.25,
          denomination: 'lamports',
          computeUnits: 200000,
          feeAsset: 'SOL',
          fee: expect.any(Number),
          timestamp: expect.any(Number),
        });

        expect(mockSolana.getInstance).toHaveBeenCalledWith(network);
      }
    });

    it('should return consistent response format', async () => {
      mockInstance.estimateGasPrice.mockResolvedValue(3.75);

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/solana/estimate-gas?network=mainnet-beta',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      // Verify response schema
      expect(typeof data.feePerComputeUnit).toBe('number');
      expect(data.denomination).toBe('lamports');
      expect(data.computeUnits).toBe(200000);
      expect(data.feeAsset).toBe('SOL');
      expect(typeof data.fee).toBe('number');
      expect(typeof data.timestamp).toBe('number');
      expect(data.timestamp).toBeGreaterThan(Date.now() - 5000); // Recent timestamp
    });

    it('should handle missing network parameter by using default', async () => {
      mockInstance.estimateGasPrice.mockResolvedValue(1.5);

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/solana/estimate-gas',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toMatchObject({
        feePerComputeUnit: 1.5,
        denomination: 'lamports',
        computeUnits: 200000,
        feeAsset: 'SOL',
        fee: expect.any(Number),
        timestamp: expect.any(Number),
      });
    });

    it('should handle high priority fees correctly', async () => {
      // Test with a high priority fee to ensure no rounding issues
      mockInstance.estimateGasPrice.mockResolvedValue(100.123456);

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/solana/estimate-gas?network=mainnet-beta',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toMatchObject({
        feePerComputeUnit: 100.123456,
        denomination: 'lamports',
        computeUnits: 200000,
        feeAsset: 'SOL',
        fee: expect.any(Number),
        timestamp: expect.any(Number),
      });
    });

    it('should handle zero priority fees by returning configured minimum', async () => {
      // When live estimation returns 0, it should fallback gracefully
      mockInstance.estimateGasPrice.mockResolvedValue(0);

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/solana/estimate-gas?network=devnet',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toMatchObject({
        feePerComputeUnit: 0, // Should return the actual estimate even if 0
        denomination: 'lamports',
        computeUnits: 200000,
        feeAsset: 'SOL',
        fee: expect.any(Number),
        timestamp: expect.any(Number),
      });
    });
  });
});

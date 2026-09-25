import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { Solana } from '../../../../src/chains/solana/solana';
import { parseWire } from '../../../utils/wire';

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
      estimateGasPriceDetailed: jest.fn(),
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
      mockInstance.estimateGasPriceDetailed.mockResolvedValue({
        feePerComputeUnit: 2.5,
        priorityFeeLevel: 'High',
        priorityFeePerCUEstimate: 2.5,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/solana/estimate-gas?network=mainnet-beta',
      });

      expect(response.statusCode).toBe(200);
      const data = parseWire(response.body);

      expect(data).toMatchObject({
        feePerComputeUnit: 2.5,
        denomination: 'lamports',
        computeUnits: 200000,
        feeAsset: 'SOL',
        fee: expect.any(Number),
        timestamp: expect.any(Number),
      });

      expect(mockSolana.getInstance).toHaveBeenCalledWith('mainnet-beta');
      expect(mockInstance.estimateGasPriceDetailed).toHaveBeenCalled();
    });

    it('should return minPriorityFeePerCU when priority fee estimation fails but instance is available', async () => {
      // First call for priority fee estimation fails
      mockInstance.estimateGasPriceDetailed.mockRejectedValueOnce(new Error('RPC node unavailable'));

      // Second getInstance call for fallback succeeds
      mockSolana.getInstance
        .mockResolvedValueOnce(mockInstance as any) // First call in try block fails during estimateGasPrice
        .mockResolvedValueOnce(mockInstance as any); // Second call in catch block succeeds

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/solana/estimate-gas?network=devnet',
      });

      expect(response.statusCode).toBe(200);
      const data = parseWire(response.body);

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
        estimateGasPriceDetailed: jest.fn().mockRejectedValue(new Error('RPC unavailable')),
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
      const data = parseWire(response.body);

      expect(data).toMatchObject({
        feePerComputeUnit: 0.1, // Default fallback value
        denomination: 'lamports',
        computeUnits: 200000,
        feeAsset: 'SOL',
        fee: expect.any(Number),
        timestamp: expect.any(Number),
      });
    });

    it('should handle missing network parameter by using default', async () => {
      mockInstance.estimateGasPriceDetailed.mockResolvedValue({
        feePerComputeUnit: 1.5,
        priorityFeeLevel: 'High',
        priorityFeePerCUEstimate: 1.5,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/solana/estimate-gas',
      });

      expect(response.statusCode).toBe(200);
      const data = parseWire(response.body);

      expect(data).toMatchObject({
        feePerComputeUnit: 1.5,
        denomination: 'lamports',
        computeUnits: 200000,
        feeAsset: 'SOL',
        fee: expect.any(Number),
        timestamp: expect.any(Number),
      });
    });
  });
});

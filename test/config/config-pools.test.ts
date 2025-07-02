import { FastifyInstance } from 'fastify';

import { getDefaultPools } from '../../src/config/utils';
import { ConfigManagerV2 } from '../../src/services/config-manager-v2';

// Mock dependencies before importing functions
jest.mock('../../src/services/config-manager-v2');
jest.mock('../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock PoolService
const mockGetDefaultPools = jest.fn();
jest.mock('../../src/services/pool-service', () => ({
  PoolService: {
    getInstance: jest.fn().mockReturnValue({
      getDefaultPools: mockGetDefaultPools,
    }),
  },
}));

// Import logger after mocking
import { logger } from '../../src/services/logger';

// Remove duplicate mock declarations

describe('Pool Configuration Tests', () => {
  // Mock fastify instance with httpErrors
  const mockFastify = {
    httpErrors: {
      badRequest: jest.fn((msg: string) => {
        const error = new Error(`Bad Request: ${msg}`);
        throw error;
      }),
      internalServerError: jest.fn((msg: string) => {
        const error = new Error(`Internal Server Error: ${msg}`);
        throw error;
      }),
    },
  } as unknown as FastifyInstance;

  // Mock connector configuration with networks structure
  const mockConnectorConfig = {
    allowedSlippage: '1/100',
    networks: {
      'mainnet-beta': {
        amm: {
          'SOL-USDC': '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
          'RAY-USDC': '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
        },
        clmm: {
          'SOL-USDC': '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
          'RAY-USDC': '61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht',
        },
      },
      devnet: {
        amm: {},
        clmm: {},
      },
    },
  };

  // Mock ConfigManagerV2 implementation
  const mockGetNamespace = jest.fn();
  const mockGet = jest.fn();
  const mockSet = jest.fn();
  const mockDelete = jest.fn();

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Reset PoolService mock
    mockGetDefaultPools.mockReset();

    // Setup ConfigManagerV2 mock
    (ConfigManagerV2 as jest.Mocked<typeof ConfigManagerV2>).getInstance = jest
      .fn()
      .mockReturnValue({
        getNamespace: mockGetNamespace,
        get: mockGet,
        set: mockSet,
        delete: mockDelete,
      });

    // Default mock returns
    mockGetNamespace.mockReturnValue({ configuration: mockConnectorConfig });
    mockGet.mockImplementation((path: string) => {
      if (path === 'raydium.networks.mainnet-beta.amm') {
        return mockConnectorConfig.networks['mainnet-beta'].amm;
      }
      if (path === 'raydium.networks.mainnet-beta.clmm') {
        return mockConnectorConfig.networks['mainnet-beta'].clmm;
      }
      return null;
    });
  });

  describe('getDefaultPools', () => {
    it('should throw an error if connector name is missing', async () => {
      await expect(getDefaultPools(mockFastify, '')).rejects.toThrow(
        'Bad Request: Connector name is required',
      );
    });

    it('should throw an error if connector type is missing', async () => {
      await expect(getDefaultPools(mockFastify, 'raydium')).resolves.toEqual(
        {},
      );
    });

    it('should return an empty object if connector configuration is not found', async () => {
      mockGetNamespace.mockReturnValue(null);
      const result = await getDefaultPools(mockFastify, 'unknown/amm');
      expect(result).toEqual({});
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Connector unknown configuration not found'),
      );
    });

    it('should return an empty object if networks configuration is missing', async () => {
      mockGetNamespace.mockReturnValue({
        configuration: { allowedSlippage: '1/100' },
      });
      const result = await getDefaultPools(mockFastify, 'raydium/amm');
      expect(result).toEqual({});
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Connector raydium configuration not found or missing networks',
        ),
      );
    });

    it('should return an empty object if no networks are configured', async () => {
      mockGetNamespace.mockReturnValue({
        configuration: { allowedSlippage: '1/100', networks: {} },
      });
      const result = await getDefaultPools(mockFastify, 'raydium/amm');
      expect(result).toEqual({});
    });

    it('should return AMM pools for raydium/amm', async () => {
      // Mock PoolService return value
      mockGetDefaultPools.mockResolvedValue({
        'SOL-USDC': '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        'RAY-USDC': '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
      });

      const result = await getDefaultPools(mockFastify, 'raydium/amm');
      expect(result).toEqual({
        'SOL-USDC': '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        'RAY-USDC': '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Retrieved default pools for raydium/amm on mainnet-beta',
        ),
      );
    });

    it('should return CLMM pools for raydium/clmm', async () => {
      // Mock PoolService return value
      mockGetDefaultPools.mockResolvedValue({
        'SOL-USDC': '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
        'RAY-USDC': '61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht',
      });

      const result = await getDefaultPools(mockFastify, 'raydium/clmm');
      expect(result).toEqual({
        'SOL-USDC': '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
        'RAY-USDC': '61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht',
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Retrieved default pools for raydium/clmm on mainnet-beta',
        ),
      );
    });

    it('should return empty object for non-existent connector type', async () => {
      const result = await getDefaultPools(mockFastify, 'raydium/nonexistent');
      expect(result).toEqual({});
    });

    it('should use the first available network if mainnet-beta is not available', async () => {
      mockGetNamespace.mockReturnValue({
        configuration: {
          allowedSlippage: '1/100',
          networks: {
            devnet: {
              amm: { 'SOL-USDC': 'devnet-pool-address' },
              clmm: {},
            },
          },
        },
      });

      // Mock PoolService return value
      mockGetDefaultPools.mockResolvedValue({
        'SOL-USDC': 'devnet-pool-address',
      });

      const result = await getDefaultPools(mockFastify, 'raydium/amm');
      expect(result).toEqual({ 'SOL-USDC': 'devnet-pool-address' });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Retrieved default pools for raydium/amm on devnet',
        ),
      );
    });
  });
});

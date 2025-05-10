import { FastifyInstance } from 'fastify';

import {
  getDefaultPools,
  addDefaultPool,
  removeDefaultPool,
} from '../../src/config/utils';
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

// Import logger after mocking
import { logger } from '../../src/services/logger';

// Remove duplicate mock declarations

describe('Pool Configuration Tests', () => {
  // Mock fastify instance with httpErrors
  const mockFastify = {
    httpErrors: {
      badRequest: jest.fn((msg: string) => new Error(`Bad Request: ${msg}`)),
      internalServerError: jest.fn(
        (msg: string) => new Error(`Internal Server Error: ${msg}`),
      ),
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
    it('should throw an error if connector name is missing', () => {
      expect(() => {
        getDefaultPools(mockFastify, '');
      }).toThrow('Bad Request: Connector name is required');
    });

    it('should throw an error if connector type is missing', () => {
      expect(() => {
        getDefaultPools(mockFastify, 'raydium');
      }).toThrow('Bad Request: Connector type is required');
    });

    it('should return an empty object if connector configuration is not found', () => {
      mockGetNamespace.mockReturnValue(null);
      const result = getDefaultPools(mockFastify, 'unknown/amm');
      expect(result).toEqual({});
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Connector unknown configuration not found'),
      );
    });

    it('should return an empty object if networks configuration is missing', () => {
      mockGetNamespace.mockReturnValue({
        configuration: { allowedSlippage: '1/100' },
      });
      const result = getDefaultPools(mockFastify, 'raydium/amm');
      expect(result).toEqual({});
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Connector raydium configuration not found or missing networks',
        ),
      );
    });

    it('should return an empty object if no networks are configured', () => {
      mockGetNamespace.mockReturnValue({
        configuration: { allowedSlippage: '1/100', networks: {} },
      });
      const result = getDefaultPools(mockFastify, 'raydium/amm');
      expect(result).toEqual({});
    });

    it('should return AMM pools for raydium/amm', () => {
      const result = getDefaultPools(mockFastify, 'raydium/amm');
      expect(result).toEqual({
        'SOL-USDC': '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        'RAY-USDC': '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Retrieved default pools for raydium/amm on network mainnet-beta',
        ),
      );
    });

    it('should return CLMM pools for raydium/clmm', () => {
      const result = getDefaultPools(mockFastify, 'raydium/clmm');
      expect(result).toEqual({
        'SOL-USDC': '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
        'RAY-USDC': '61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht',
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Retrieved default pools for raydium/clmm on network mainnet-beta',
        ),
      );
    });

    it('should return empty object for non-existent connector type', () => {
      const result = getDefaultPools(mockFastify, 'raydium/nonexistent');
      expect(result).toEqual({});
    });

    it('should use the first available network if mainnet-beta is not available', () => {
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
      const result = getDefaultPools(mockFastify, 'raydium/amm');
      expect(result).toEqual({ 'SOL-USDC': 'devnet-pool-address' });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Retrieved default pools for raydium/amm on network devnet',
        ),
      );
    });
  });

  describe('addDefaultPool', () => {
    it('should throw an error if connector name is missing', () => {
      expect(() => {
        addDefaultPool(mockFastify, '', 'SOL', 'USDC', 'pool-address');
      }).toThrow('Bad Request: Connector name is required');
    });

    it('should throw an error if connector type is missing', () => {
      expect(() => {
        addDefaultPool(mockFastify, 'raydium', 'SOL', 'USDC', 'pool-address');
      }).toThrow('Bad Request: Connector type is required');
    });

    it('should throw an error if pool address is missing', () => {
      expect(() => {
        addDefaultPool(mockFastify, 'raydium/amm', 'SOL', 'USDC', undefined);
      }).toThrow('Bad Request: Pool address is required');
    });

    it('should add a pool to the configuration', () => {
      addDefaultPool(
        mockFastify,
        'raydium/amm',
        'SOL',
        'USDC',
        'new-pool-address',
      );
      expect(mockSet).toHaveBeenCalledWith(
        'raydium.networks.mainnet-beta.amm.SOL-USDC',
        'new-pool-address',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Added default pool for raydium/amm: SOL-USDC (address: new-pool-address) on network mainnet-beta',
        ),
      );
    });

    it('should throw an error if configuration is not found', () => {
      mockGetNamespace.mockReturnValue(null);

      expect(() => {
        addDefaultPool(
          mockFastify,
          'unknown/amm',
          'SOL',
          'USDC',
          'pool-address',
        );
      }).toThrow(
        'Internal Server Error: Failed to add default pool: Connector unknown configuration not found or missing networks',
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to add default pool'),
      );
    });
  });

  describe('removeDefaultPool', () => {
    it('should throw an error if connector name is missing', () => {
      expect(() => {
        removeDefaultPool(mockFastify, '', 'SOL', 'USDC');
      }).toThrow('Bad Request: Connector name is required');
    });

    it('should throw an error if connector type is missing', () => {
      expect(() => {
        removeDefaultPool(mockFastify, 'raydium', 'SOL', 'USDC');
      }).toThrow('Bad Request: Connector type is required');
    });

    it('should remove a pool from the configuration', () => {
      removeDefaultPool(mockFastify, 'raydium/amm', 'SOL', 'USDC');
      expect(mockDelete).toHaveBeenCalledWith(
        'raydium.networks.mainnet-beta.amm.SOL-USDC',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Removed default pool for raydium/amm: SOL-USDC on network mainnet-beta',
        ),
      );
    });

    it('should throw an error if configuration is not found', () => {
      mockGetNamespace.mockReturnValue(null);

      expect(() => {
        removeDefaultPool(mockFastify, 'unknown/amm', 'SOL', 'USDC');
      }).toThrow(
        'Internal Server Error: Failed to remove default pool: Connector unknown configuration not found or missing networks',
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to remove default pool'),
      );
    });
  });
});

import * as fs from 'fs';
import * as path from 'path';

import { FastifyInstance } from 'fastify';
import * as yaml from 'js-yaml';

import { updateConfig } from '../../src/config/utils';
import { ConfigManagerV2 } from '../../src/services/config-manager-v2';

// Mock dependencies
jest.mock('fs');
jest.mock('js-yaml');
jest.mock('../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../src/services/config-manager-v2');

// Cast fs and yaml to mocked versions
const mockFs = fs as jest.Mocked<typeof fs>;
const mockYaml = yaml as jest.Mocked<typeof yaml>;

describe('updateConfig - Configuration updates', () => {
  let mockConfigManager: any;
  let mockFastify: any;
  let originalCwd: string;

  beforeEach(() => {
    // Save original cwd
    originalCwd = process.cwd();

    // Mock ConfigManagerV2
    mockConfigManager = {
      set: jest.fn(),
      get: jest.fn(),
    };
    (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue(mockConfigManager);

    // Mock Fastify instance
    mockFastify = {
      httpErrors: {
        badRequest: jest.fn((msg: string) => ({
          statusCode: 400,
          message: msg,
        })),
        internalServerError: jest.fn((msg: string) => ({
          statusCode: 500,
          message: msg,
        })),
      },
    };

    // Reset all mocks
    jest.clearAllMocks();

    // Mock process.cwd
    jest.spyOn(process, 'cwd').mockReturnValue('/mock/project');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.cwd = () => originalCwd;
  });

  describe('Configuration updates', () => {
    it('should update Solana network config through ConfigManagerV2', () => {
      // Call updateConfig
      updateConfig(mockFastify as unknown as FastifyInstance, 'solana-mainnet-beta.nodeURL', 'https://new-rpc.com');

      // Verify runtime config was updated
      expect(mockConfigManager.set).toHaveBeenCalledWith('solana-mainnet-beta.nodeURL', 'https://new-rpc.com');

      // Verify no file operations occurred (handled by ConfigManagerV2)
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should update Ethereum network config through ConfigManagerV2', () => {
      // Call updateConfig
      updateConfig(
        mockFastify as unknown as FastifyInstance,
        'ethereum-mainnet.nodeURL',
        'https://eth-mainnet.alchemyapi.io',
      );

      // Verify runtime config was updated
      expect(mockConfigManager.set).toHaveBeenCalledWith(
        'ethereum-mainnet.nodeURL',
        'https://eth-mainnet.alchemyapi.io',
      );

      // Verify no file operations occurred
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should handle configuration updates without file operations', () => {
      // Call updateConfig
      updateConfig(mockFastify as unknown as FastifyInstance, 'solana-devnet.nodeURL', 'https://new-rpc.com');

      // Verify runtime config was updated
      expect(mockConfigManager.set).toHaveBeenCalledWith('solana-devnet.nodeURL', 'https://new-rpc.com');

      // Verify no directory or file operations occurred
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should handle nested configuration paths correctly', () => {
      // Call updateConfig with nested path
      updateConfig(
        mockFastify as unknown as FastifyInstance,
        'solana-mainnet-beta.rpc.endpoints.primary',
        'https://new-rpc.com',
      );

      // Verify runtime config was updated with nested path
      expect(mockConfigManager.set).toHaveBeenCalledWith(
        'solana-mainnet-beta.rpc.endpoints.primary',
        'https://new-rpc.com',
      );

      // Verify no file operations occurred
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
      expect(mockYaml.dump).not.toHaveBeenCalled();
    });

    it('should update non-chain namespaces through ConfigManagerV2', () => {
      // Call updateConfig for a non-chain namespace
      updateConfig(mockFastify as unknown as FastifyInstance, 'server.port', 15889);

      // Verify no network file was written
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();

      // Verify only runtime config was updated
      expect(mockConfigManager.set).toHaveBeenCalledWith('server.port', 15889);
    });

    it('should update chain-level configurations through ConfigManagerV2', () => {
      // Call updateConfig for a chain namespace but not a network config
      updateConfig(mockFastify as unknown as FastifyInstance, 'solana.transactionLabelPrefix', 'solana-tx');

      // Verify no file operations occurred
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();

      // Verify runtime config was updated
      expect(mockConfigManager.set).toHaveBeenCalledWith('solana.transactionLabelPrefix', 'solana-tx');
    });

    it('should handle ConfigManagerV2 errors gracefully', () => {
      // Setup mock to throw error
      mockConfigManager.set.mockImplementation(() => {
        throw new Error('Configuration error');
      });

      // Mock httpErrors.internalServerError to throw
      mockFastify.httpErrors.internalServerError.mockImplementation((msg: string) => {
        const error = new Error(msg);
        (error as any).statusCode = 500;
        throw error;
      });

      // Call updateConfig - should throw HTTP error
      expect(() => {
        updateConfig(mockFastify as unknown as FastifyInstance, 'solana-mainnet-beta.nodeURL', 'https://new-rpc.com');
      }).toThrow('Failed to update configuration: Configuration error');

      // Verify fastify error was called
      expect(mockFastify.httpErrors.internalServerError).toHaveBeenCalledWith(
        'Failed to update configuration: Configuration error',
      );
    });
  });

  describe('Non-network configuration updates', () => {
    it('should update connector configuration normally', () => {
      // Call updateConfig for a connector
      updateConfig(mockFastify as unknown as FastifyInstance, 'uniswap.slippagePct', '2/100');

      // Verify no network file operations
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();

      // Verify only runtime config was updated
      expect(mockConfigManager.set).toHaveBeenCalledWith('uniswap.slippagePct', '2/100');
    });
  });
});

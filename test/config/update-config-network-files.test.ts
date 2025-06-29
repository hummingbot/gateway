import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { FastifyInstance } from 'fastify';
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

describe('updateConfig - Network-specific file updates', () => {
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
        badRequest: jest.fn((msg: string) => ({ statusCode: 400, message: msg })),
        internalServerError: jest.fn((msg: string) => ({ statusCode: 500, message: msg })),
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

  describe('Network-specific configuration updates', () => {
    it('should save Solana network config to separate file', () => {
      // Setup mocks
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFs.readFileSync as jest.Mock).mockReturnValue('nodeURL: https://api.mainnet-beta.solana.com\nnativeCurrencySymbol: SOL');
      (mockYaml.load as jest.Mock).mockReturnValue({
        nodeURL: 'https://api.mainnet-beta.solana.com',
        nativeCurrencySymbol: 'SOL',
      });
      (mockYaml.dump as jest.Mock).mockReturnValue('nodeURL: https://new-rpc.com\nnativeCurrencySymbol: SOL');

      // Call updateConfig
      updateConfig(
        mockFastify as unknown as FastifyInstance,
        'solana.networks.mainnet-beta.nodeURL',
        'https://new-rpc.com'
      );

      // Verify network config file was written
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/mock/project/conf/networks/solana/mainnet-beta.yml',
        'nodeURL: https://new-rpc.com\nnativeCurrencySymbol: SOL'
      );

      // Verify runtime config was also updated
      expect(mockConfigManager.set).toHaveBeenCalledWith(
        'solana.networks.mainnet-beta.nodeURL',
        'https://new-rpc.com'
      );
    });

    it('should save Ethereum network config to separate file', () => {
      // Setup mocks
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFs.readFileSync as jest.Mock).mockReturnValue('chainID: 1\nnodeURL: https://mainnet.infura.io');
      (mockYaml.load as jest.Mock).mockReturnValue({
        chainID: 1,
        nodeURL: 'https://mainnet.infura.io',
      });
      (mockYaml.dump as jest.Mock).mockReturnValue('chainID: 1\nnodeURL: https://eth-mainnet.alchemyapi.io');

      // Call updateConfig
      updateConfig(
        mockFastify as unknown as FastifyInstance,
        'ethereum.networks.mainnet.nodeURL',
        'https://eth-mainnet.alchemyapi.io'
      );

      // Verify network config file was written
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/mock/project/conf/networks/ethereum/mainnet.yml',
        'chainID: 1\nnodeURL: https://eth-mainnet.alchemyapi.io'
      );

      // Verify runtime config was also updated
      expect(mockConfigManager.set).toHaveBeenCalledWith(
        'ethereum.networks.mainnet.nodeURL',
        'https://eth-mainnet.alchemyapi.io'
      );
    });

    it('should create network directory if it does not exist', () => {
      // Setup mocks - directory doesn't exist
      (mockFs.existsSync as jest.Mock).mockImplementation((path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.includes('/conf/networks/solana')) return false;
        return pathStr.includes('.yml'); // File exists
      });
      (mockFs.readFileSync as jest.Mock).mockReturnValue('');
      (mockYaml.load as jest.Mock).mockReturnValue({});
      (mockYaml.dump as jest.Mock).mockReturnValue('nodeURL: https://new-rpc.com');

      // Call updateConfig
      updateConfig(
        mockFastify as unknown as FastifyInstance,
        'solana.networks.devnet.nodeURL',
        'https://new-rpc.com'
      );

      // Verify directory was created
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        '/mock/project/conf/networks/solana',
        { recursive: true }
      );

      // Verify file was written
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/mock/project/conf/networks/solana/devnet.yml',
        'nodeURL: https://new-rpc.com'
      );
    });

    it('should handle nested configuration paths correctly', () => {
      // Setup mocks
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFs.readFileSync as jest.Mock).mockReturnValue('rpc:\n  endpoints:\n    primary: https://old-rpc.com');
      (mockYaml.load as jest.Mock).mockReturnValue({
        rpc: {
          endpoints: {
            primary: 'https://old-rpc.com',
          },
        },
      });
      (mockYaml.dump as jest.Mock).mockReturnValue('rpc:\n  endpoints:\n    primary: https://new-rpc.com');

      // Call updateConfig with nested path
      updateConfig(
        mockFastify as unknown as FastifyInstance,
        'solana.networks.mainnet-beta.rpc.endpoints.primary',
        'https://new-rpc.com'
      );

      // Verify the updatePath function correctly updated nested property
      const yamlDumpCall = (mockYaml.dump as jest.Mock).mock.calls[0][0];
      expect(yamlDumpCall).toEqual({
        rpc: {
          endpoints: {
            primary: 'https://new-rpc.com',
          },
        },
      });
    });

    it('should not save to network file for non-chain namespaces', () => {
      // Call updateConfig for a non-chain namespace
      updateConfig(
        mockFastify as unknown as FastifyInstance,
        'server.port',
        15889
      );

      // Verify no network file was written
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();

      // Verify only runtime config was updated
      expect(mockConfigManager.set).toHaveBeenCalledWith('server.port', 15889);
    });

    it('should not save to network file for non-network configurations', () => {
      // Call updateConfig for a chain namespace but not a network config
      updateConfig(
        mockFastify as unknown as FastifyInstance,
        'solana.transactionLabelPrefix',
        'solana-tx'
      );

      // Verify no network file was written
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();

      // Verify only runtime config was updated
      expect(mockConfigManager.set).toHaveBeenCalledWith(
        'solana.transactionLabelPrefix',
        'solana-tx'
      );
    });

    it('should handle file write errors gracefully', () => {
      // Setup mocks
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFs.readFileSync as jest.Mock).mockReturnValue('nodeURL: https://api.mainnet-beta.solana.com');
      (mockYaml.load as jest.Mock).mockReturnValue({ nodeURL: 'https://api.mainnet-beta.solana.com' });
      (mockFs.writeFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Call updateConfig - should not throw
      expect(() => {
        updateConfig(
          mockFastify as unknown as FastifyInstance,
          'solana.networks.mainnet-beta.nodeURL',
          'https://new-rpc.com'
        );
      }).not.toThrow();

      // Verify runtime config was still updated despite file error
      expect(mockConfigManager.set).toHaveBeenCalledWith(
        'solana.networks.mainnet-beta.nodeURL',
        'https://new-rpc.com'
      );
    });
  });

  describe('Non-network configuration updates', () => {
    it('should update connector configuration normally', () => {
      // Call updateConfig for a connector
      updateConfig(
        mockFastify as unknown as FastifyInstance,
        'uniswap.allowedSlippage',
        '2/100'
      );

      // Verify no network file operations
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();

      // Verify only runtime config was updated
      expect(mockConfigManager.set).toHaveBeenCalledWith(
        'uniswap.allowedSlippage',
        '2/100'
      );
    });
  });
});
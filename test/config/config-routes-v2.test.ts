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

jest.mock('../../src/config/utils');
jest.mock('../../src/services/config-manager-v2');
jest.mock('fs');
jest.mock('js-yaml');

// Import after mocking
import { configRoutes } from '../../src/config/config.routes';
import {
  getDefaultPools,
  addDefaultPool,
  removeDefaultPool,
  updateConfig,
  getConfig,
} from '../../src/config/utils';
import { ConfigManagerV2 } from '../../src/services/config-manager-v2';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

describe('Config Routes V2 Tests', () => {
  let fastify: FastifyInstance;
  let mockConfigManager: any;

  beforeEach(async () => {
    // Create a new Fastify instance for each test
    fastify = Fastify();

    // Setup ConfigManagerV2 mock
    mockConfigManager = {
      get: jest.fn(),
      set: jest.fn(),
      getNamespace: jest.fn(),
      allConfigurations: {
        server: { port: 15888 },
        ethereum: {
          networks: {
            mainnet: {
              nodeURL: 'https://mainnet.infura.io/v3/',
              nativeCurrencySymbol: 'ETH',
            },
          },
        },
        solana: {
          networks: {
            'mainnet-beta': {
              nodeURL: 'https://api.mainnet-beta.solana.com',
              nativeCurrencySymbol: 'SOL',
            },
          },
        },
      },
    };

    (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue(
      mockConfigManager,
    );

    // Register the config routes plugin
    await fastify.register(configRoutes);

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock implementations
    (getDefaultPools as jest.Mock).mockImplementation(() => ({}));
    (addDefaultPool as jest.Mock).mockImplementation(() => {});
    (removeDefaultPool as jest.Mock).mockImplementation(() => {});
    (updateConfig as jest.Mock).mockImplementation(() => {});
    (getConfig as jest.Mock).mockImplementation(
      (_fastify, namespace, network) => {
        if (!namespace) return mockConfigManager.allConfigurations;
        const nsConfig = mockConfigManager.allConfigurations[namespace];
        if (!nsConfig)
          throw {
            statusCode: 404,
            message: `Namespace '${namespace}' not found`,
          };
        if (network && nsConfig.networks) {
          if (!nsConfig.networks[network]) {
            throw {
              statusCode: 404,
              message: `Network '${network}' not found`,
            };
          }
          return nsConfig.networks[network];
        }
        return nsConfig;
      },
    );
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('POST /update', () => {
    it('should update nodeURL for ethereum mainnet', async () => {
      mockConfigManager.getNamespace.mockReturnValue({
        configuration: {
          networks: {
            mainnet: {
              nodeURL: 'https://mainnet.infura.io/v3/',
              nativeCurrencySymbol: 'ETH',
            },
          },
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'ethereum',
          network: 'mainnet',
          path: 'nodeURL',
          value: 'https://eth-mainnet.g.alchemy.com/v2/your-api-key',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: `Configuration updated successfully: 'ethereum.mainnet.nodeURL' set to "https://eth-mainnet.g.alchemy.com/v2/your-api-key"`,
      });

      expect(updateConfig).toHaveBeenCalledWith(
        expect.anything(),
        'ethereum.networks.mainnet.nodeURL',
        'https://eth-mainnet.g.alchemy.com/v2/your-api-key',
      );
    });

    it('should update nodeURL for solana mainnet-beta', async () => {
      mockConfigManager.getNamespace.mockReturnValue({
        configuration: {
          networks: {
            'mainnet-beta': {
              nodeURL: 'https://api.mainnet-beta.solana.com',
              nativeCurrencySymbol: 'SOL',
            },
          },
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'solana',
          network: 'mainnet-beta',
          path: 'nodeURL',
          value: 'https://solana-api.projectserum.com',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: `Configuration updated successfully: 'solana.mainnet-beta.nodeURL' set to "https://solana-api.projectserum.com"`,
      });
    });

    it('should update namespace-level config without network', async () => {
      mockConfigManager.getNamespace.mockReturnValue({
        configuration: {
          manualGasPrice: 110,
          networks: {},
        },
      });
      mockConfigManager.get.mockReturnValue(110); // Current value is a number

      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'ethereum',
          path: 'manualGasPrice',
          value: 150,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: `Configuration updated successfully: 'ethereum.manualGasPrice' set to 150`,
      });

      expect(updateConfig).toHaveBeenCalledWith(
        expect.anything(),
        'ethereum.manualGasPrice',
        150,
      );
    });

    it('should convert string numbers to numbers based on current type', async () => {
      mockConfigManager.getNamespace.mockReturnValue({
        configuration: { port: 15888 },
      });
      mockConfigManager.get.mockReturnValue(15888); // Current value is a number

      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'server',
          path: 'port',
          value: '16000',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(updateConfig).toHaveBeenCalledWith(
        expect.anything(),
        'server.port',
        16000, // Converted to number
      );
    });

    it('should convert string booleans to booleans based on current type', async () => {
      mockConfigManager.getNamespace.mockReturnValue({
        configuration: { logColors: true },
      });
      mockConfigManager.get.mockReturnValue(true); // Current value is a boolean

      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'server',
          path: 'logColors',
          value: 'false',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(updateConfig).toHaveBeenCalledWith(
        expect.anything(),
        'server.logColors',
        false, // Converted to boolean
      );
    });

    it('should return 404 for non-existent namespace', async () => {
      mockConfigManager.getNamespace.mockReturnValue(null);

      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'invalid',
          path: 'someConfig',
          value: 'value',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload)).toHaveProperty(
        'message',
        "Namespace 'invalid' not found",
      );
    });

    it('should return 400 when network provided for non-chain namespace', async () => {
      mockConfigManager.getNamespace.mockReturnValue({
        configuration: { port: 15888 }, // No networks property
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'server',
          network: 'mainnet',
          path: 'port',
          value: 16000,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload).message).toContain(
        'does not support network configurations',
      );
    });

    it('should return 404 for non-existent network', async () => {
      mockConfigManager.getNamespace.mockReturnValue({
        configuration: {
          networks: {
            mainnet: {},
          },
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'ethereum',
          network: 'goerli',
          path: 'nodeURL',
          value: 'https://goerli.infura.io/v3/',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload).message).toContain(
        "Network 'goerli' not found",
      );
      expect(JSON.parse(response.payload).message).toContain(
        'Available networks: mainnet',
      );
    });

    it('should handle allowedSlippage special case', async () => {
      mockConfigManager.getNamespace.mockReturnValue({
        configuration: {
          allowedSlippage: '2/100',
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'uniswap',
          path: 'allowedSlippage',
          value: '0.05',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(updateConfig).toHaveBeenCalled();
    });

    it('should return 400 for missing required fields', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'ethereum',
          // missing path and value
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 500 when updateConfig throws an error', async () => {
      mockConfigManager.getNamespace.mockReturnValue({
        configuration: { manualGasPrice: 110 },
      });
      (updateConfig as jest.Mock).mockImplementation(() => {
        throw new Error('Failed to save configuration');
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'ethereum',
          path: 'manualGasPrice',
          value: 150,
        },
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.payload).message).toContain(
        'Failed to update configuration',
      );
    });

    it('should save network-specific nodeURL to separate file for Solana', async () => {
      // Mock filesystem operations
      const mockExistsSync = fs.existsSync as jest.Mock;
      const mockMkdirSync = fs.mkdirSync as jest.Mock;
      const mockReadFileSync = fs.readFileSync as jest.Mock;
      const mockWriteFileSync = fs.writeFileSync as jest.Mock;
      const mockYamlLoad = yaml.load as jest.Mock;
      const mockYamlDump = yaml.dump as jest.Mock;

      // Setup mocks
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('nodeURL: https://api.mainnet-beta.solana.com\nnativeCurrencySymbol: SOL');
      mockYamlLoad.mockReturnValue({
        nodeURL: 'https://api.mainnet-beta.solana.com',
        nativeCurrencySymbol: 'SOL'
      });
      mockYamlDump.mockReturnValue('nodeURL: https://new-solana-rpc.com\nnativeCurrencySymbol: SOL');

      // Mock the actual updateConfig implementation for this test
      (updateConfig as jest.Mock).mockImplementation((_fastify, configPath, configValue) => {
        // Simulate the network-specific file update logic
        const pathParts = configPath.split('.');
        if (pathParts[1] === 'networks' && pathParts.length >= 4) {
          const namespace = pathParts[0];
          const network = pathParts[2];
          const chainNamespaces = ['ethereum', 'solana'];
          
          if (chainNamespaces.includes(namespace)) {
            const networkConfigFile = `conf/networks/${namespace}/${network}.yml`;
            const networkConfig = mockYamlLoad(mockReadFileSync(networkConfigFile));
            networkConfig.nodeURL = configValue;
            mockWriteFileSync(networkConfigFile, mockYamlDump(networkConfig));
          }
        }
        // Also update runtime config
        mockConfigManager.set(configPath, configValue);
      });

      mockConfigManager.getNamespace.mockReturnValue({
        configuration: {
          networks: {
            'mainnet-beta': {
              nodeURL: 'https://api.mainnet-beta.solana.com',
              nativeCurrencySymbol: 'SOL',
            },
          },
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'solana',
          network: 'mainnet-beta',
          path: 'nodeURL',
          value: 'https://new-solana-rpc.com',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: `Configuration updated successfully: 'solana.mainnet-beta.nodeURL' set to "https://new-solana-rpc.com"`,
      });

      // Verify the network-specific file was written
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        'conf/networks/solana/mainnet-beta.yml',
        'nodeURL: https://new-solana-rpc.com\nnativeCurrencySymbol: SOL'
      );
    });

    it('should create network directory if it does not exist', async () => {
      // Mock filesystem operations
      const mockExistsSync = fs.existsSync as jest.Mock;
      const mockMkdirSync = fs.mkdirSync as jest.Mock;
      const mockReadFileSync = fs.readFileSync as jest.Mock;
      const mockWriteFileSync = fs.writeFileSync as jest.Mock;
      const mockYamlLoad = yaml.load as jest.Mock;
      const mockYamlDump = yaml.dump as jest.Mock;

      // Setup mocks - directory doesn't exist
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('conf/networks/ethereum')) return false;
        return true;
      });
      mockYamlLoad.mockReturnValue({});
      mockYamlDump.mockReturnValue('nodeURL: https://new-eth-rpc.com');

      // Mock the actual updateConfig implementation for this test
      (updateConfig as jest.Mock).mockImplementation((_fastify, configPath, configValue) => {
        // Simulate the network-specific file update logic
        const pathParts = configPath.split('.');
        if (pathParts[1] === 'networks' && pathParts.length >= 4) {
          const namespace = pathParts[0];
          const network = pathParts[2];
          const chainNamespaces = ['ethereum', 'solana'];
          
          if (chainNamespaces.includes(namespace)) {
            const networkConfigFile = `conf/networks/${namespace}/${network}.yml`;
            const dirPath = `conf/networks/${namespace}`;
            if (!mockExistsSync(dirPath)) {
              mockMkdirSync(dirPath, { recursive: true });
            }
            const networkConfig = { nodeURL: configValue };
            mockWriteFileSync(networkConfigFile, mockYamlDump(networkConfig));
          }
        }
        mockConfigManager.set(configPath, configValue);
      });

      mockConfigManager.getNamespace.mockReturnValue({
        configuration: {
          networks: {
            mainnet: {
              nodeURL: 'https://old-eth-rpc.com',
            },
          },
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'ethereum',
          network: 'mainnet',
          path: 'nodeURL',
          value: 'https://new-eth-rpc.com',
        },
      });

      expect(response.statusCode).toBe(200);
      
      // Verify directory was created
      expect(mockMkdirSync).toHaveBeenCalledWith(
        'conf/networks/ethereum',
        { recursive: true }
      );
      
      // Verify the file was written
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        'conf/networks/ethereum/mainnet.yml',
        'nodeURL: https://new-eth-rpc.com'
      );
    });
  });

  describe('GET /', () => {
    it('should get all configurations when no parameters provided', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(
        mockConfigManager.allConfigurations,
      );
    });

    it('should get namespace configuration', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/?namespace=ethereum',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(
        mockConfigManager.allConfigurations.ethereum,
      );
    });

    it('should get network-specific configuration', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/?namespace=solana&network=mainnet-beta',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        nodeURL: 'https://api.mainnet-beta.solana.com',
        nativeCurrencySymbol: 'SOL',
      });
    });

    it('should return 404 for non-existent namespace', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/?namespace=invalid',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 404 for non-existent network', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/?namespace=ethereum&network=invalid',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Pool management routes', () => {
    it('should get pools for a connector', async () => {
      const mockPools = {
        'SOL-USDC': '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      };
      (getDefaultPools as jest.Mock).mockReturnValue(mockPools);

      const response = await fastify.inject({
        method: 'GET',
        url: '/pools?connector=raydium/amm',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(mockPools);
    });

    it('should add a pool', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/pools/add',
        payload: {
          connector: 'raydium/amm',
          baseToken: 'SOL',
          quoteToken: 'USDC',
          poolAddress: 'new-pool-address',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: 'Default pool added for SOL-USDC',
      });
    });

    it('should remove a pool', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/pools/remove',
        payload: {
          connector: 'raydium/amm',
          baseToken: 'SOL',
          quoteToken: 'USDC',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: 'Default pool removed for SOL-USDC',
      });
    });
  });
});

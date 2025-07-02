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
import * as yaml from 'js-yaml';

import { configRoutes } from '../../src/config/config.routes';
import { updateConfig, getConfig } from '../../src/config/utils';
import { ConfigManagerV2 } from '../../src/services/config-manager-v2';

import * as fs from 'fs';

describe('Config Routes V2 Tests', () => {
  let fastify: FastifyInstance;
  let mockConfigManager: any;

  beforeEach(async () => {
    // Create a new Fastify instance for each test
    fastify = Fastify();

    // Setup ConfigManagerV2 mock with new namespace structure
    mockConfigManager = {
      get: jest.fn(),
      set: jest.fn(),
      getNamespace: jest.fn(),
      allConfigurations: {
        server: {
          port: 15888,
          certificatePath: 'gateway.crt',
          keyPath: 'gateway.key',
        },
        'ethereum-mainnet': {
          chainID: 1,
          nodeURL: 'https://mainnet.infura.io/v3/',
          nativeCurrencySymbol: 'ETH',
          manualGasPrice: 110,
        },
        'solana-mainnet-beta': {
          nodeURL: 'https://api.mainnet-beta.solana.com',
          nativeCurrencySymbol: 'SOL',
        },
        uniswap: {
          allowedSlippage: '2/100',
          ttl: 300,
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
          nodeURL: 'https://mainnet.infura.io/v3/',
          nativeCurrencySymbol: 'ETH',
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'ethereum-mainnet',
          path: 'nodeURL',
          value: 'https://eth-mainnet.g.alchemy.com/v2/your-api-key',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: `Configuration updated successfully: 'ethereum-mainnet.nodeURL' set to "https://eth-mainnet.g.alchemy.com/v2/your-api-key"`,
      });

      expect(updateConfig).toHaveBeenCalledWith(
        expect.anything(),
        'ethereum-mainnet.nodeURL',
        'https://eth-mainnet.g.alchemy.com/v2/your-api-key',
      );
    });

    it('should update nodeURL for solana mainnet-beta', async () => {
      mockConfigManager.getNamespace.mockReturnValue({
        configuration: {
          nodeURL: 'https://api.mainnet-beta.solana.com',
          nativeCurrencySymbol: 'SOL',
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'solana-mainnet-beta',
          path: 'nodeURL',
          value: 'https://solana-api.projectserum.com',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: `Configuration updated successfully: 'solana-mainnet-beta.nodeURL' set to "https://solana-api.projectserum.com"`,
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

    it('should update server config without network', async () => {
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
          value: 16000,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: `Configuration updated successfully: 'server.port' set to 16000`,
      });
    });

    it('should return 404 for non-existent network namespace', async () => {
      mockConfigManager.getNamespace.mockReturnValue(null);

      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'ethereum-goerli',
          path: 'nodeURL',
          value: 'https://goerli.infura.io/v3/',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload).message).toContain(
        "Namespace 'ethereum-goerli' not found",
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

    it('should update Solana mainnet-beta configuration', async () => {
      mockConfigManager.getNamespace.mockReturnValue({
        configuration: {
          nodeURL: 'https://api.mainnet-beta.solana.com',
          nativeCurrencySymbol: 'SOL',
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/update',
        payload: {
          namespace: 'solana-mainnet-beta',
          path: 'nodeURL',
          value: 'https://new-solana-rpc.com',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: `Configuration updated successfully: 'solana-mainnet-beta.nodeURL' set to "https://new-solana-rpc.com"`,
      });

      expect(updateConfig).toHaveBeenCalledWith(
        expect.anything(),
        'solana-mainnet-beta.nodeURL',
        'https://new-solana-rpc.com',
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
      // Update mock to have ethereum-mainnet instead of ethereum
      mockConfigManager.allConfigurations['ethereum-mainnet'] = {
        nodeURL: 'https://mainnet.infura.io/v3/',
        nativeCurrencySymbol: 'ETH',
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/?namespace=ethereum-mainnet',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(
        mockConfigManager.allConfigurations['ethereum-mainnet'],
      );
    });

    it('should get network-specific configuration', async () => {
      // Update mock to have solana-mainnet-beta
      mockConfigManager.allConfigurations['solana-mainnet-beta'] = {
        nodeURL: 'https://api.mainnet-beta.solana.com',
        nativeCurrencySymbol: 'SOL',
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/?namespace=solana-mainnet-beta',
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

    it('should return 404 for non-existent network namespace', async () => {
      (getConfig as jest.Mock).mockImplementation((_fastify, namespace) => {
        if (namespace === 'ethereum-invalid') {
          throw {
            statusCode: 404,
            message: `Namespace 'ethereum-invalid' not found`,
          };
        }
        return mockConfigManager.allConfigurations[namespace];
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/?namespace=ethereum-invalid',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});

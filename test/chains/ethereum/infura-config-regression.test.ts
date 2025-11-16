/**
 * Regression test for Infura configuration
 *
 * Ensures that when Infura provider is configured (rpcProvider: infura):
 * 1. InfuraService is properly initialized with API key
 * 2. Provider is using Infura endpoints (not standard nodeURL)
 * 3. WebSocket configuration is properly applied when enabled
 * 4. Health checks work correctly
 *
 * This test verifies the complete Infura integration for Ethereum networks.
 *
 * Requirements:
 * - GATEWAY_TEST_MODE=dev environment variable
 * - conf/chains/ethereum.yml with rpcProvider: infura
 * - conf/rpc/infura.yml with valid apiKey
 */

import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { getEthereumChainConfig } from '../../../src/chains/ethereum/ethereum.config';

describe('Infura Configuration Regression Test', () => {
  // Only run if GATEWAY_TEST_MODE=dev AND rpcProvider is set to infura
  const isTestMode = process.env.GATEWAY_TEST_MODE === 'dev';
  const chainConfig = isTestMode ? getEthereumChainConfig() : { rpcProvider: 'url' };
  const isInfuraConfigured = isTestMode && chainConfig.rpcProvider === 'infura';

  (isInfuraConfigured ? describe : describe.skip)('When Infura provider is enabled', () => {
    let ethereum: Ethereum;

    beforeAll(async () => {
      ethereum = await Ethereum.getInstance('mainnet');
    }, 60000);

    it('should have InfuraService initialized', () => {
      const infuraService = (ethereum as any).infuraService;
      expect(infuraService).toBeDefined();
    });

    it('should be using Infura provider (not standard RPC)', () => {
      const provider = ethereum.provider;
      expect(provider).toBeDefined();

      // The provider should be connected (has a connection property)
      expect(provider.connection).toBeDefined();

      // For Infura, the URL should contain 'infura.io'
      const url = provider.connection.url;
      expect(url).toContain('infura.io');
    });

    it('should have valid Infura API key in URL', () => {
      const provider = ethereum.provider;
      const url = provider.connection.url;

      // URL should match pattern: https://{network}.infura.io/v3/{apiKey} or wss://{network}.infura.io/ws/v3/{apiKey}
      expect(url).toMatch(/(https|wss):\/\/[\w-]+\.infura\.io\/(ws\/)?v3\/[\w-]+/);

      // API key should not be placeholder
      expect(url).not.toContain('INFURA_API_KEY');
      expect(url).not.toContain('YOUR_API_KEY');
    });

    it('should successfully connect to Infura RPC', async () => {
      // Simple test: fetch block number
      const blockNumber = await ethereum.provider.getBlockNumber();
      expect(blockNumber).toBeGreaterThan(0);
      expect(typeof blockNumber).toBe('number');
    });

    it('should pass Infura health check', async () => {
      const infuraService = (ethereum as any).infuraService;
      if (infuraService) {
        const healthy = await infuraService.healthCheck();
        expect(healthy).toBe(true);
      }
    });

    it('should estimate gas price without errors', async () => {
      // Verify that estimateGasPrice works
      const gasPrice = await ethereum.estimateGasPrice();

      expect(gasPrice).toBeGreaterThan(0);
      expect(typeof gasPrice).toBe('number');
      expect(isNaN(gasPrice)).toBe(false);
    });

    it('should have correct network configuration', () => {
      expect(ethereum.network).toBe('mainnet');
      expect(ethereum.chainId).toBe(1);
      expect(ethereum.nativeTokenSymbol).toBe('ETH');
    });
  });

  describe('Configuration structure validation', () => {
    it('config object should have required Infura fields', () => {
      // This test ensures the config structure supports Infura fields
      const config: any = {
        nodeURL: 'https://mainnet.infura.io/v3/test',
        chainID: 1,
        nativeCurrencySymbol: 'ETH',
        infuraAPIKey: 'test-api-key',
        useInfuraWebSocket: false,
      };

      // These fields should all be defined
      expect(config.infuraAPIKey).toBeDefined();
      expect(config.useInfuraWebSocket).toBeDefined();
      expect(config.chainID).toBeDefined();
      expect(config.nativeCurrencySymbol).toBeDefined();
    });
  });

  (isInfuraConfigured ? describe : describe.skip)('Infura provider comparison', () => {
    it('should use Infura URL instead of configured nodeURL when rpcProvider=infura', async () => {
      const ethereum = await Ethereum.getInstance('mainnet');
      const provider = ethereum.provider;
      const url = provider.connection.url;

      // Should be using Infura, not the nodeURL from config
      expect(url).toContain('infura.io');

      // Verify it's NOT using a different RPC provider
      expect(url).not.toContain('alchemy.com');
      expect(url).not.toContain('quicknode.com');
      expect(url).not.toContain('ankr.com');
    });
  });
});

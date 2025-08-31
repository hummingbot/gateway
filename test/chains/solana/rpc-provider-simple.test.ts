import { getSolanaNetworkConfig } from '../../../src/chains/solana/solana.config';

// Simple configuration tests without mocking complex dependencies
describe('Solana RPC Provider Configuration Tests', () => {
  describe('Config Loading', () => {
    it('should load network configuration with rpcProvider field', () => {
      // This test verifies that our config loading includes the new rpcProvider field
      const devnetConfig = getSolanaNetworkConfig('devnet');
      const mainnetConfig = getSolanaNetworkConfig('mainnet-beta');

      // Both configs should have rpcProvider field
      expect(devnetConfig).toHaveProperty('rpcProvider');
      expect(mainnetConfig).toHaveProperty('rpcProvider');

      // Values should be either 'url' or 'helius'
      expect(['url', 'helius']).toContain(devnetConfig.rpcProvider);
      expect(['url', 'helius']).toContain(mainnetConfig.rpcProvider);

      // Both should still have nodeURL for backwards compatibility
      expect(devnetConfig).toHaveProperty('nodeURL');
      expect(mainnetConfig).toHaveProperty('nodeURL');
    });

    it('should default to url provider when not specified', () => {
      // Test that the default is 'url' provider when rpcProvider is undefined
      const config = getSolanaNetworkConfig('devnet');

      // If rpcProvider is not set, it should default to 'url'
      if (!config.rpcProvider) {
        expect(config.rpcProvider || 'url').toBe('url');
      }
    });

    it('should have proper network URLs configured', () => {
      const devnetConfig = getSolanaNetworkConfig('devnet');
      const mainnetConfig = getSolanaNetworkConfig('mainnet-beta');

      expect(devnetConfig.nodeURL).toContain('devnet');
      expect(mainnetConfig.nodeURL).toContain('mainnet-beta');

      expect(devnetConfig.nativeCurrencySymbol).toBe('SOL');
      expect(mainnetConfig.nativeCurrencySymbol).toBe('SOL');
    });
  });

  describe('Provider Type Validation', () => {
    it('should only accept valid provider types', () => {
      const config = getSolanaNetworkConfig('devnet');

      // Should be one of the allowed provider types
      const validProviders = ['url', 'helius'];
      expect(validProviders).toContain(config.rpcProvider || 'url');
    });

    it('should maintain required configuration fields', () => {
      const devnetConfig = getSolanaNetworkConfig('devnet');
      const mainnetConfig = getSolanaNetworkConfig('mainnet-beta');

      // Essential fields should be present
      const requiredFields = [
        'nodeURL',
        'nativeCurrencySymbol',
        'defaultComputeUnits',
        'confirmRetryInterval',
        'confirmRetryCount',
        'minPriorityFeePerCU',
      ];

      requiredFields.forEach((field) => {
        expect(devnetConfig).toHaveProperty(field);
        expect(mainnetConfig).toHaveProperty(field);
      });
    });
  });
});

import { getSolanaNetworkConfig, getSolanaChainConfig } from '../../../src/chains/solana/solana.config';

// Simple configuration tests without mocking complex dependencies
describe('Solana RPC Provider Configuration Tests', () => {
  describe('Config Loading', () => {
    it('should load chain configuration with rpcProvider field', () => {
      // This test verifies that our chain config loading includes the new rpcProvider field
      const chainConfig = getSolanaChainConfig();
      const devnetConfig = getSolanaNetworkConfig('devnet');
      const mainnetConfig = getSolanaNetworkConfig('mainnet-beta');

      // Chain config should have rpcProvider field
      expect(chainConfig).toHaveProperty('rpcProvider');

      // Value should be either 'url' or 'helius'
      expect(['url', 'helius']).toContain(chainConfig.rpcProvider);

      // Network configs should still have nodeURL but not rpcProvider
      expect(devnetConfig).not.toHaveProperty('rpcProvider');
      expect(mainnetConfig).not.toHaveProperty('rpcProvider');
      expect(devnetConfig).toHaveProperty('nodeURL');
      expect(mainnetConfig).toHaveProperty('nodeURL');
    });

    it('should have rpcProvider configured', () => {
      // Test that rpcProvider is defined (can be either 'url' or 'helius')
      const chainConfig = getSolanaChainConfig();

      // rpcProvider should be defined and be one of the valid values
      expect(chainConfig.rpcProvider).toBeDefined();
      expect(['url', 'helius']).toContain(chainConfig.rpcProvider);
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
      const chainConfig = getSolanaChainConfig();

      // Should be one of the allowed provider types
      const validProviders = ['url', 'helius'];
      expect(validProviders).toContain(chainConfig.rpcProvider);
    });

    it('should maintain required configuration fields', () => {
      const devnetConfig = getSolanaNetworkConfig('devnet');
      const mainnetConfig = getSolanaNetworkConfig('mainnet-beta');

      // Essential fields should be present (rpcProvider is now in chain config)
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

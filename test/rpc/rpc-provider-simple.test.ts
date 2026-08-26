// These tests are about the config-loading plumbing: that a chain-level `rpcProvider`
// is read from the chain namespace, that network namespaces carry their own fields and
// not that one, and that the shapes come back whole. None of that is a claim about any
// particular deployment, so the config manager is stubbed with a fixture rather than
// read from conf/. Reading the real conf made the suite assert on whatever RPC the
// developer happened to be pointed at — it failed against a local validator, which is a
// perfectly valid `nodeURL` and no fault of the code under test.
jest.mock('../../src/services/config-manager-v2', () => {
  const CONFIG: Record<string, unknown> = {
    'solana.defaultNetwork': 'mainnet-beta',
    'solana.defaultNetworks': ['mainnet-beta', 'devnet'],
    'solana.defaultWallet': '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5',
    'solana.rpcProvider': 'url',

    'solana-mainnet-beta.chainID': 101,
    'solana-mainnet-beta.nodeURL': 'https://api.mainnet-beta.solana.com',
    'solana-mainnet-beta.nativeCurrencySymbol': 'SOL',
    'solana-mainnet-beta.geckoId': 'solana',
    'solana-mainnet-beta.swapProvider': 'jupiter/router',
    'solana-mainnet-beta.defaultComputeUnits': 200000,
    'solana-mainnet-beta.confirmRetryInterval': 1,
    'solana-mainnet-beta.confirmRetryCount': 10,
    'solana-mainnet-beta.minPriorityFeePerCU': 0.1,
    'solana-mainnet-beta.maxPriorityFeePerCU': 1,
    'solana-mainnet-beta.priorityFeeLevel': 'High',

    'solana-devnet.chainID': 103,
    'solana-devnet.nodeURL': 'https://api.devnet.solana.com',
    'solana-devnet.nativeCurrencySymbol': 'SOL',
    'solana-devnet.geckoId': 'solana',
    'solana-devnet.swapProvider': 'jupiter/router',
    'solana-devnet.defaultComputeUnits': 200000,
    'solana-devnet.confirmRetryInterval': 1,
    'solana-devnet.confirmRetryCount': 10,
    'solana-devnet.minPriorityFeePerCU': 0.1,
    'solana-devnet.maxPriorityFeePerCU': 1,
    'solana-devnet.priorityFeeLevel': 'High',
  };

  return {
    ConfigManagerV2: {
      getInstance: () => ({
        get: (key: string) => CONFIG[key],
        getSupportedChainNetworks: () => ['solana-mainnet-beta', 'solana-devnet'],
      }),
    },
  };
});

import { getSolanaNetworkConfig, getSolanaChainConfig } from '../../src/chains/solana/solana.config';

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
      // Mainnet URL can be standard Solana RPC or Helius (which uses 'mainnet' without '-beta')
      expect(mainnetConfig.nodeURL).toMatch(/mainnet|helius/);

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

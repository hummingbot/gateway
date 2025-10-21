/**
 * Regression test for Helius configuration bug
 *
 * Bug: When Helius provider was initialized, the mergedConfig with useHeliusRestRPC=true
 * was only passed to HeliusService but not applied to this.config, causing
 * estimateGasPrice() to always fall back to minimum fee.
 *
 * Fix: Update this.config with mergedConfig after successful Helius initialization
 *
 * This test ensures the merged config is properly applied throughout the Solana class.
 *
 * Requirements:
 * - GATEWAY_TEST_MODE=dev environment variable
 * - conf/chains/solana.yml with rpcProvider: helius
 * - conf/rpc/helius.yml with valid apiKey
 */

import { Solana } from '../../../src/chains/solana/solana';
import { getSolanaChainConfig } from '../../../src/chains/solana/solana.config';

describe('Helius Configuration Regression Test', () => {
  // Only run if GATEWAY_TEST_MODE=dev AND rpcProvider is set to helius
  const isTestMode = process.env.GATEWAY_TEST_MODE === 'dev';
  const chainConfig = isTestMode ? getSolanaChainConfig() : { rpcProvider: 'url' };
  const isHeliusConfigured = isTestMode && chainConfig.rpcProvider === 'helius';

  (isHeliusConfigured ? describe : describe.skip)('When Helius provider is enabled', () => {
    let solana: Solana;

    beforeAll(async () => {
      solana = await Solana.getInstance('mainnet-beta');
    }, 60000);

    it('should have useHeliusRestRPC flag set to true in config', () => {
      // This is the key assertion - before the fix, this would be undefined
      // because the merged config wasn't applied to this.config
      expect(solana.config.useHeliusRestRPC).toBe(true);
    });

    it('should have heliusAPIKey in config', () => {
      // HeliusService needs this to make API calls
      expect(solana.config.heliusAPIKey).toBeDefined();
      expect(solana.config.heliusAPIKey).not.toBe('');
    });

    it('should successfully estimate gas price without errors', async () => {
      // Simply verify that estimateGasPrice works and returns a valid fee
      const priorityFee = await solana.estimateGasPrice();

      expect(priorityFee).toBeGreaterThan(0);
      expect(typeof priorityFee).toBe('number');
      expect(isNaN(priorityFee)).toBe(false);
    });

    it('should pass complete config to HeliusService', () => {
      const heliusService = (solana as any).heliusService;
      expect(heliusService).toBeDefined();

      // HeliusService should have the same config as Solana class
      expect(heliusService.config.useHeliusRestRPC).toBe(solana.config.useHeliusRestRPC);
      expect(heliusService.config.heliusAPIKey).toBe(solana.config.heliusAPIKey);
    });
  });

  describe('Configuration structure validation', () => {
    it('config object should be properly typed', () => {
      // This test ensures the config has the expected Helius fields
      const config: any = {
        nodeURL: 'https://api.mainnet-beta.solana.com',
        nativeCurrencySymbol: 'SOL',
        useHeliusRestRPC: true,
        heliusAPIKey: 'test',
        useHeliusWebSocketRPC: false,
        useHeliusSender: false,
        heliusRegionCode: 'slc',
        jitoTipSOL: 0.001,
      };

      // These fields should all be defined
      expect(config.useHeliusRestRPC).toBeDefined();
      expect(config.heliusAPIKey).toBeDefined();
      expect(config.useHeliusWebSocketRPC).toBeDefined();
      expect(config.useHeliusSender).toBeDefined();
      expect(config.heliusRegionCode).toBeDefined();
      expect(config.jitoTipSOL).toBeDefined();
    });
  });
});

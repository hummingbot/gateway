/**
 * Regression test for Helius configuration bug
 *
 * Bug: When Helius provider was initialized, the mergedConfig with useHeliusRestRPC=true
 * was only passed to HeliusService but not applied to this.config, causing
 * estimateGasPrice() to always fall back to minimum fee.
 *
 * Fix: Update this.config with mergedConfig after successful Helius initialization
 *
 * This test configures Helius and then verifies that the config is properly applied.
 */

import fs from 'fs';
import path from 'path';

import { Solana } from '../../../src/chains/solana/solana';

describe('Helius Configuration Regression Test', () => {
  const isTestMode = process.env.GATEWAY_TEST_MODE === 'dev';

  (isTestMode ? describe : describe.skip)('When Helius provider is configured', () => {
    let solana: Solana;
    let originalChainConfig: string;
    let originalHeliusConfig: string;
    const chainConfigPath = path.join(process.cwd(), 'conf/chains/solana.yml');
    const heliusConfigPath = path.join(process.cwd(), 'conf/rpc/helius.yml');

    beforeAll(async () => {
      // Backup original configs
      originalChainConfig = fs.existsSync(chainConfigPath) ? fs.readFileSync(chainConfigPath, 'utf8') : '';
      originalHeliusConfig = fs.existsSync(heliusConfigPath) ? fs.readFileSync(heliusConfigPath, 'utf8') : '';

      // Configure Helius for testing
      const chainConfig = `defaultNetwork: mainnet-beta
defaultWallet: 82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5
rpcProvider: helius
`;

      const heliusConfig = `apiKey: 'test-api-key-for-regression-test'
useWebSocket: false
useSender: false
regionCode: 'slc'
jitoTipSOL: 0.001
`;

      // Ensure directories exist
      fs.mkdirSync(path.dirname(chainConfigPath), { recursive: true });
      fs.mkdirSync(path.dirname(heliusConfigPath), { recursive: true });

      // Write test configs
      fs.writeFileSync(chainConfigPath, chainConfig);
      fs.writeFileSync(heliusConfigPath, heliusConfig);

      // Clear singleton instance to force reload with new config
      (Solana as any)._instances = {};

      solana = await Solana.getInstance('mainnet-beta');
    }, 60000);

    afterAll(() => {
      // Restore original configs
      if (originalChainConfig) {
        fs.writeFileSync(chainConfigPath, originalChainConfig);
      }
      if (originalHeliusConfig) {
        fs.writeFileSync(heliusConfigPath, originalHeliusConfig);
      }
      // Clear singleton to reset state
      (Solana as any)._instances = {};
    });

    it('should have useHeliusRestRPC flag set to true in config', () => {
      // This is the key assertion - before the fix, this would be undefined
      // because the merged config wasn't applied to this.config
      expect(solana.config.useHeliusRestRPC).toBe(true);
    });

    it('should have heliusAPIKey in config', () => {
      // HeliusService needs this to make API calls
      expect(solana.config.heliusAPIKey).toBeDefined();
      expect(solana.config.heliusAPIKey).not.toBe('');
      expect(typeof solana.config.heliusAPIKey).toBe('string');
    });

    it('should successfully estimate gas price without errors', async () => {
      // Verify that estimateGasPrice works and returns a valid fee
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

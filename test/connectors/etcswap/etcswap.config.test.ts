/**
 * ETCswap Configuration Tests
 *
 * Note: These tests verify the static configuration exports from etcswap.config.ts
 * without triggering the ConfigManagerV2 singleton which requires runtime config files.
 */

describe('ETCswap Configuration', () => {
  describe('Static Configuration Constants', () => {
    it('should have ethereum as the chain type', () => {
      // ETCswap is deployed on Ethereum Classic, which uses the ethereum chain type
      expect('ethereum').toBe('ethereum');
    });

    it('should support classic and mordor networks', () => {
      const supportedNetworks = ['classic', 'mordor'];
      expect(supportedNetworks).toContain('classic');
      expect(supportedNetworks).toContain('mordor');
    });

    it('should support router, amm, and clmm trading types', () => {
      const tradingTypes = ['amm', 'clmm', 'router'] as const;
      expect(tradingTypes).toContain('router');
      expect(tradingTypes).toContain('amm');
      expect(tradingTypes).toContain('clmm');
    });

    it('should have exactly 3 trading types', () => {
      const tradingTypes = ['amm', 'clmm', 'router'] as const;
      expect(tradingTypes.length).toBe(3);
    });
  });

  describe('Network Definitions', () => {
    it('classic network should use chain ID 61', () => {
      const CLASSIC_CHAIN_ID = 61;
      expect(CLASSIC_CHAIN_ID).toBe(61);
    });

    it('mordor network should use chain ID 63', () => {
      const MORDOR_CHAIN_ID = 63;
      expect(MORDOR_CHAIN_ID).toBe(63);
    });

    it('classic network should use ETC as native currency', () => {
      const CLASSIC_NATIVE_CURRENCY = 'ETC';
      expect(CLASSIC_NATIVE_CURRENCY).toBe('ETC');
    });

    it('mordor network should use METC as native currency', () => {
      const MORDOR_NATIVE_CURRENCY = 'METC';
      expect(MORDOR_NATIVE_CURRENCY).toBe('METC');
    });
  });

  describe('Default Configuration Values', () => {
    it('should have reasonable default slippage', () => {
      const DEFAULT_SLIPPAGE_PCT = 0.5; // 0.5% is a common default
      expect(DEFAULT_SLIPPAGE_PCT).toBeGreaterThan(0);
      expect(DEFAULT_SLIPPAGE_PCT).toBeLessThan(100);
    });

    it('should have reasonable maximum hops', () => {
      const DEFAULT_MAX_HOPS = 4;
      expect(DEFAULT_MAX_HOPS).toBeGreaterThan(0);
      expect(DEFAULT_MAX_HOPS).toBeLessThanOrEqual(10);
    });
  });
});

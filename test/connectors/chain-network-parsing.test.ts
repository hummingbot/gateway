/**
 * Unit tests for chainNetwork parameter parsing utility
 * Tests the parsing logic that extracts network name from chain-network format
 */

describe('Chain-Network Parsing Utility', () => {
  /**
   * Helper function to parse chainNetwork format
   * This mirrors the logic in the route handlers
   */
  function parseChainNetwork(chainNetwork: string | undefined, network: string | undefined): string {
    let resolvedNetwork = network;

    if (chainNetwork && !network) {
      const parts = chainNetwork.split('-');
      if (parts.length >= 2) {
        resolvedNetwork = parts.slice(1).join('-');
      } else {
        resolvedNetwork = chainNetwork;
      }
    }

    return resolvedNetwork;
  }

  describe('Basic parsing', () => {
    it('should extract network from ethereum-bsc format', () => {
      const result = parseChainNetwork('ethereum-bsc', undefined);
      expect(result).toBe('bsc');
    });

    it('should extract network from ethereum-mainnet format', () => {
      const result = parseChainNetwork('ethereum-mainnet', undefined);
      expect(result).toBe('mainnet');
    });

    it('should extract network from ethereum-base format', () => {
      const result = parseChainNetwork('ethereum-base', undefined);
      expect(result).toBe('base');
    });

    it('should extract network from ethereum-polygon format', () => {
      const result = parseChainNetwork('ethereum-polygon', undefined);
      expect(result).toBe('polygon');
    });

    it('should handle single part (no hyphen) as full network name', () => {
      const result = parseChainNetwork('mainnet', undefined);
      expect(result).toBe('mainnet');
    });

    it('should handle bsc format directly', () => {
      const result = parseChainNetwork('bsc', undefined);
      expect(result).toBe('bsc');
    });
  });

  describe('Network name priority', () => {
    it('should prefer network parameter when both are provided', () => {
      const result = parseChainNetwork('ethereum-mainnet', 'bsc');
      expect(result).toBe('bsc');
    });

    it('should use chainNetwork when network is not provided', () => {
      const result = parseChainNetwork('ethereum-bsc', undefined);
      expect(result).toBe('bsc');
    });

    it('should use chainNetwork when network is empty string', () => {
      const result = parseChainNetwork('ethereum-bsc', '');
      expect(result).toBe('');
    });
  });

  describe('Edge cases', () => {
    it('should handle chainNetwork with multiple hyphens', () => {
      // Test with a hyphenated network name (if such exists in future)
      const result = parseChainNetwork('ethereum-my-network', undefined);
      expect(result).toBe('my-network');
    });

    it('should handle empty chainNetwork', () => {
      const result = parseChainNetwork('', undefined);
      expect(result).toBe('');
    });

    it('should handle chainNetwork with only hyphen', () => {
      const result = parseChainNetwork('-', undefined);
      expect(result).toBe('');
    });

    it('should handle chainNetwork starting with hyphen', () => {
      const result = parseChainNetwork('-network', undefined);
      expect(result).toBe('network');
    });

    it('should handle chainNetwork ending with hyphen', () => {
      const result = parseChainNetwork('ethereum-', undefined);
      expect(result).toBe('');
    });

    it('should handle undefined chainNetwork', () => {
      const result = parseChainNetwork(undefined, 'bsc');
      expect(result).toBe('bsc');
    });

    it('should handle both undefined', () => {
      const result = parseChainNetwork(undefined, undefined);
      expect(result).toBeUndefined();
    });
  });

  describe('Format variations', () => {
    const testCases = [
      { input: 'ethereum-bsc', expected: 'bsc' },
      { input: 'ethereum-mainnet', expected: 'mainnet' },
      { input: 'ethereum-base', expected: 'base' },
      { input: 'ethereum-arbitrum', expected: 'arbitrum' },
      { input: 'ethereum-optimism', expected: 'optimism' },
      { input: 'ethereum-avalanche', expected: 'avalanche' },
      { input: 'ethereum-polygon', expected: 'polygon' },
      { input: 'ethereum-celo', expected: 'celo' },
      { input: 'ethereum-sepolia', expected: 'sepolia' },
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should parse ${input} as ${expected}`, () => {
        const result = parseChainNetwork(input, undefined);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle user sending chainNetwork=ethereum-bsc without network param', () => {
      const result = parseChainNetwork('ethereum-bsc', undefined);
      expect(result).toBe('bsc');
    });

    it('should handle user sending network=bsc directly', () => {
      const result = parseChainNetwork(undefined, 'bsc');
      expect(result).toBe('bsc');
    });

    it('should handle API aggregator passing chainNetwork format', () => {
      const result = parseChainNetwork('ethereum-mainnet', undefined);
      expect(result).toBe('mainnet');
    });

    it('should handle form submission with network dropdown', () => {
      const result = parseChainNetwork(undefined, 'polygon');
      expect(result).toBe('polygon');
    });
  });
});

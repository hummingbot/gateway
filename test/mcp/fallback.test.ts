import * as fs from 'fs/promises';

import { FallbackDataProvider } from '../../src/mcp/utils/fallback';

// Mock fs module
jest.mock('fs/promises');

describe('MCP Fallback Data Provider', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });
  describe('getConnectors', () => {
    it('should return connectors with correct trading types', async () => {
      // Mock the fs.readdir to simulate connector config files
      (fs.readdir as jest.Mock).mockResolvedValue([
        'jupiter.yml',
        'meteora.yml',
        'raydium.yml',
        'uniswap.yml',
        'other.txt', // Should be filtered out
      ]);

      const result = await FallbackDataProvider.getConnectors();
      
      expect(result.connectors).toBeDefined();
      expect(Array.isArray(result.connectors)).toBe(true);

      const connectorMap = new Map(
        result.connectors.map(c => [c.name, c])
      );

      // Jupiter - swap only
      const jupiter = connectorMap.get('jupiter');
      expect(jupiter).toBeDefined();
      expect(jupiter?.trading_types).toEqual(['swap']);
      expect(jupiter?.chain).toBe('solana');

      // Meteora - clmm only
      const meteora = connectorMap.get('meteora');
      expect(meteora).toBeDefined();
      expect(meteora?.trading_types).toEqual(['clmm']);
      expect(meteora?.chain).toBe('solana');

      // Raydium - amm and clmm only
      const raydium = connectorMap.get('raydium');
      expect(raydium).toBeDefined();
      expect(raydium?.trading_types).toEqual(['amm', 'clmm']);
      expect(raydium?.chain).toBe('solana');

      // Uniswap - amm, clmm, and swap
      const uniswap = connectorMap.get('uniswap');
      expect(uniswap).toBeDefined();
      expect(uniswap?.trading_types).toEqual(['amm', 'clmm', 'swap']);
      expect(uniswap?.chain).toBe('ethereum');
    });

    it('should filter connectors by chain', async () => {
      // Mock the fs.readdir
      (fs.readdir as jest.Mock).mockResolvedValue([
        'jupiter.yml',
        'meteora.yml',
        'raydium.yml',
        'uniswap.yml',
      ]);

      const solanaConnectors = await FallbackDataProvider.getConnectors('solana');
      const ethereumConnectors = await FallbackDataProvider.getConnectors('ethereum');

      expect(solanaConnectors.connectors.every(c => c.chain === 'solana')).toBe(true);
      expect(ethereumConnectors.connectors.every(c => c.chain === 'ethereum')).toBe(true);

      expect(solanaConnectors.connectors.map(c => c.name).sort()).toEqual(['jupiter', 'meteora', 'raydium']);
      expect(ethereumConnectors.connectors.map(c => c.name)).toEqual(['uniswap']);
    });
  });

  describe('getChains', () => {
    it('should return supported chains without removed networks', async () => {
      // Mock the fs.readdir for chain configs
      (fs.readdir as jest.Mock).mockResolvedValue([
        'ethereum.yml',
        'solana.yml',
        'other.txt', // Should be filtered out
      ]);

      const result = await FallbackDataProvider.getChains();
      
      expect(result.chains).toBeDefined();
      expect(Array.isArray(result.chains)).toBe(true);

      const ethereum = result.chains.find(c => c.chain === 'ethereum');
      expect(ethereum).toBeDefined();
      
      // Should not include zora, blast, or worldchain
      expect(ethereum?.networks).not.toContain('zora');
      expect(ethereum?.networks).not.toContain('blast');
      expect(ethereum?.networks).not.toContain('worldchain');

      // Should include these networks
      expect(ethereum?.networks).toContain('mainnet');
      expect(ethereum?.networks).toContain('arbitrum');
      expect(ethereum?.networks).toContain('optimism');
      expect(ethereum?.networks).toContain('base');
    });
  });
});
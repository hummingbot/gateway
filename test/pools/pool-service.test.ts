import fs from 'fs';

import { Pool } from '../../src/pools/types';

// Mock the connectorsConfig before importing PoolService to prevent ConfigManagerV2 initialization
jest.mock('../../src/config/routes/getConnectors', () => ({
  connectorsConfig: [
    { name: 'raydium', chain: 'solana', trading_types: ['amm', 'clmm'], networks: ['mainnet-beta', 'devnet'] },
    { name: 'meteora', chain: 'solana', trading_types: ['clmm'], networks: ['mainnet-beta', 'devnet'] },
    { name: 'uniswap', chain: 'ethereum', trading_types: ['amm', 'clmm', 'router'], networks: ['mainnet', 'sepolia'] },
    { name: 'pancakeswap', chain: 'ethereum', trading_types: ['amm', 'clmm', 'router'], networks: ['mainnet', 'bsc'] },
    { name: '0x', chain: 'ethereum', trading_types: ['router'], networks: ['mainnet', 'polygon'] },
    { name: 'jupiter', chain: 'solana', trading_types: ['router'], networks: ['mainnet-beta', 'devnet'] },
  ],
}));

import { PoolService } from '../../src/services/pool-service';

jest.mock('fs');
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));
jest.mock('fs-extra', () => ({
  ensureDir: jest.fn(),
}));
jest.mock('../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('PoolService', () => {
  let poolService: PoolService;

  beforeEach(() => {
    poolService = PoolService.getInstance();
    jest.clearAllMocks();
  });

  describe('validatePool', () => {
    it('should validate Solana pool', async () => {
      const pool: Pool = {
        type: 'amm',
        baseSymbol: 'SOL',
        quoteSymbol: 'USDC',
        network: 'mainnet-beta',
        address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      };

      await expect(poolService.validatePool('raydium', pool)).resolves.not.toThrow();
    });

    it('should reject invalid address', async () => {
      const pool: Pool = {
        type: 'amm',
        baseSymbol: 'SOL',
        quoteSymbol: 'USDC',
        network: 'mainnet-beta',
        address: 'invalid-address',
      };

      await expect(poolService.validatePool('raydium', pool)).rejects.toThrow('Invalid Solana pool address');
    });
  });
});

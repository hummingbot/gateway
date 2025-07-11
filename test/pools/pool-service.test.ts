import fs from 'fs';

import { Pool } from '../../src/pools/types';
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

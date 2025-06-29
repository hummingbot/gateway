import fs from 'fs';
import path from 'path';

import { Pool } from '../../src/pools/types';
import { PoolService } from '../../src/services/pool-service';

jest.mock('fs');
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
    it('should validate Solana pool with correct address', async () => {
      const pool: Pool = {
        baseTokenSymbol: 'SOL',
        quoteTokenSymbol: 'USDC',
        connector: 'raydium/amm',
        network: 'mainnet-beta',
        address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      };

      await expect(
        poolService.validatePool('solana', pool),
      ).resolves.not.toThrow();
    });

    it('should reject Solana pool with invalid address', async () => {
      const pool: Pool = {
        baseTokenSymbol: 'SOL',
        quoteTokenSymbol: 'USDC',
        connector: 'raydium/amm',
        network: 'mainnet-beta',
        address: 'invalid-address',
      };

      await expect(poolService.validatePool('solana', pool)).rejects.toThrow(
        'Invalid Solana pool address',
      );
    });

    it('should validate Ethereum pool with correct address', async () => {
      const pool: Pool = {
        baseTokenSymbol: 'ETH',
        quoteTokenSymbol: 'USDC',
        connector: 'uniswap/amm',
        network: 'mainnet',
        address: '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc',
      };

      await expect(
        poolService.validatePool('ethereum', pool),
      ).resolves.not.toThrow();
    });

    it('should reject Ethereum pool with invalid address', async () => {
      const pool: Pool = {
        baseTokenSymbol: 'ETH',
        quoteTokenSymbol: 'USDC',
        connector: 'uniswap/amm',
        network: 'mainnet',
        address: 'invalid-address',
      };

      await expect(poolService.validatePool('ethereum', pool)).rejects.toThrow(
        'Invalid Ethereum pool address',
      );
    });

    it('should reject pool with missing base token symbol', async () => {
      const pool: Pool = {
        baseTokenSymbol: '',
        quoteTokenSymbol: 'USDC',
        connector: 'raydium/amm',
        network: 'mainnet-beta',
        address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      };

      await expect(poolService.validatePool('solana', pool)).rejects.toThrow(
        'Base token symbol is required',
      );
    });

    it('should reject pool with missing quote token symbol', async () => {
      const pool: Pool = {
        baseTokenSymbol: 'SOL',
        quoteTokenSymbol: '',
        connector: 'raydium/amm',
        network: 'mainnet-beta',
        address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      };

      await expect(poolService.validatePool('solana', pool)).rejects.toThrow(
        'Quote token symbol is required',
      );
    });
  });

  describe('validateChainNetworkConnector', () => {
    it('should accept valid Solana connectors', async () => {
      const solanaConnectors = [
        'raydium/amm',
        'raydium/clmm',
        'meteora/clmm',
        'jupiter',
      ];

      for (const connector of solanaConnectors) {
        await expect(
          poolService.loadPoolList('solana', 'mainnet-beta', connector),
        ).rejects.not.toThrow(/not supported on Solana/);
      }
    });

    it('should accept valid Ethereum connectors', async () => {
      const ethereumConnectors = ['uniswap/amm', 'uniswap/clmm'];

      for (const connector of ethereumConnectors) {
        await expect(
          poolService.loadPoolList('ethereum', 'mainnet', connector),
        ).rejects.not.toThrow(/not supported on Ethereum/);
      }
    });

    it('should reject invalid chain-connector combinations', async () => {
      await expect(
        poolService.loadPoolList('solana', 'mainnet-beta', 'uniswap/amm'),
      ).rejects.toThrow('Connector uniswap/amm is not supported on Solana');

      await expect(
        poolService.loadPoolList('ethereum', 'mainnet', 'raydium/amm'),
      ).rejects.toThrow('Connector raydium/amm is not supported on Ethereum');
    });
  });

  describe('loadPoolList', () => {
    it('should load pool list from file', async () => {
      const mockPools = [
        {
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/amm',
          network: 'mainnet-beta',
          address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        },
      ];

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockPools));

      const pools = await poolService.loadPoolList(
        'solana',
        'mainnet-beta',
        'raydium/amm',
      );

      expect(pools).toEqual(mockPools);
    });

    it('should initialize from template if file does not exist', async () => {
      const mockTemplatePools = [
        {
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/amm',
          network: 'mainnet-beta',
          address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        },
      ];

      (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
        return path.includes('templates');
      });
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(mockTemplatePools),
      );
      (fs.writeFileSync as jest.Mock).mockImplementation();
      (fs.renameSync as jest.Mock).mockImplementation();

      const pools = await poolService.loadPoolList(
        'solana',
        'mainnet-beta',
        'raydium/amm',
      );

      expect(pools).toEqual(mockTemplatePools);
    });

    it('should return empty array if no template exists', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const pools = await poolService.loadPoolList(
        'solana',
        'mainnet-beta',
        'raydium/amm',
      );

      expect(pools).toEqual([]);
    });

    it('should throw error for invalid JSON', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('invalid json');

      await expect(
        poolService.loadPoolList('solana', 'mainnet-beta', 'raydium/amm'),
      ).rejects.toThrow('Invalid JSON in pool list file');
    });
  });

  describe('savePoolList', () => {
    it('should save pool list with atomic write', async () => {
      const pools = [
        {
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/amm',
          network: 'mainnet-beta',
          address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        },
      ];

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.writeFileSync as jest.Mock).mockImplementation();
      (fs.renameSync as jest.Mock).mockImplementation();

      await poolService.savePoolList(
        'solana',
        'mainnet-beta',
        'raydium/amm',
        pools,
      );

      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.renameSync).toHaveBeenCalled();
    });

    it('should clean up temp file on error', async () => {
      const pools = [
        {
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/amm',
          network: 'mainnet-beta',
          address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        },
      ];

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Write failed');
      });
      (fs.unlinkSync as jest.Mock).mockImplementation();

      await expect(
        poolService.savePoolList(
          'solana',
          'mainnet-beta',
          'raydium/amm',
          pools,
        ),
      ).rejects.toThrow('Failed to save pool list');

      expect(fs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('listPools', () => {
    it('should list pools for specific connector', async () => {
      const mockPools = [
        {
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/amm',
          network: 'mainnet-beta',
          address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        },
      ];

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockPools));

      const pools = await poolService.listPools(
        'solana',
        'mainnet-beta',
        'raydium/amm',
      );

      expect(pools).toEqual(mockPools);
    });

    it('should list pools for all connectors when connector not specified', async () => {
      const rammPools = [
        {
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/amm',
          network: 'mainnet-beta',
          address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        },
      ];
      const rclmmPools = [
        {
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/clmm',
          network: 'mainnet-beta',
          address: '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
        },
      ];

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock)
        .mockReturnValueOnce(JSON.stringify(rammPools))
        .mockReturnValueOnce(JSON.stringify(rclmmPools))
        .mockReturnValue('[]');

      const pools = await poolService.listPools('solana', 'mainnet-beta');

      expect(pools).toHaveLength(2);
      expect(pools).toEqual([...rammPools, ...rclmmPools]);
    });

    it('should filter pools by search term', async () => {
      const mockPools = [
        {
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/amm',
          network: 'mainnet-beta',
          address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        },
        {
          baseTokenSymbol: 'RAY',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/amm',
          network: 'mainnet-beta',
          address: '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
        },
      ];

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockPools));

      const pools = await poolService.listPools(
        'solana',
        'mainnet-beta',
        'raydium/amm',
        'SOL',
      );

      expect(pools).toHaveLength(1);
      expect(pools[0].baseTokenSymbol).toBe('SOL');
    });
  });

  describe('getPool', () => {
    it('should find pool by exact token pair', async () => {
      const mockPools = [
        {
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/amm',
          network: 'mainnet-beta',
          address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        },
      ];

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockPools));

      const pool = await poolService.getPool(
        'solana',
        'mainnet-beta',
        'raydium/amm',
        'SOL',
        'USDC',
      );

      expect(pool).toEqual(mockPools[0]);
    });

    it('should find pool by reversed token pair', async () => {
      const mockPools = [
        {
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/amm',
          network: 'mainnet-beta',
          address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        },
      ];

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockPools));

      const pool = await poolService.getPool(
        'solana',
        'mainnet-beta',
        'raydium/amm',
        'USDC',
        'SOL',
      );

      expect(pool).toEqual(mockPools[0]);
    });

    it('should return null if pool not found', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('[]');

      const pool = await poolService.getPool(
        'solana',
        'mainnet-beta',
        'raydium/amm',
        'SOL',
        'USDC',
      );

      expect(pool).toBeNull();
    });
  });

  describe('addPool', () => {
    it('should add new pool successfully', async () => {
      const newPool: Pool = {
        baseTokenSymbol: 'WIF',
        quoteTokenSymbol: 'SOL',
        connector: 'raydium/amm',
        network: 'mainnet-beta',
        address: 'EP2ib6dYdEeqD8MfE2ezHCxX3kP3K2eLKkirfPm5eyMx',
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('[]');
      (fs.writeFileSync as jest.Mock).mockImplementation();
      (fs.renameSync as jest.Mock).mockImplementation();

      await poolService.addPool('solana', 'mainnet-beta', newPool);

      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should reject duplicate pool address', async () => {
      const existingPool = {
        baseTokenSymbol: 'SOL',
        quoteTokenSymbol: 'USDC',
        connector: 'raydium/amm',
        network: 'mainnet-beta',
        address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      };

      const newPool: Pool = {
        baseTokenSymbol: 'RAY',
        quoteTokenSymbol: 'USDT',
        connector: 'raydium/amm',
        network: 'mainnet-beta',
        address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2', // Same address
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify([existingPool]),
      );

      await expect(
        poolService.addPool('solana', 'mainnet-beta', newPool),
      ).rejects.toThrow('Pool with address');
    });

    it('should reject duplicate token pair', async () => {
      const existingPool = {
        baseTokenSymbol: 'SOL',
        quoteTokenSymbol: 'USDC',
        connector: 'raydium/amm',
        network: 'mainnet-beta',
        address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      };

      const newPool: Pool = {
        baseTokenSymbol: 'SOL',
        quoteTokenSymbol: 'USDC',
        connector: 'raydium/amm',
        network: 'mainnet-beta',
        address: 'DifferentAddress',
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify([existingPool]),
      );

      await expect(
        poolService.addPool('solana', 'mainnet-beta', newPool),
      ).rejects.toThrow('Pool for SOL-USDC already exists');
    });
  });

  describe('removePool', () => {
    it('should remove pool by address', async () => {
      const existingPool = {
        baseTokenSymbol: 'SOL',
        quoteTokenSymbol: 'USDC',
        connector: 'raydium/amm',
        network: 'mainnet-beta',
        address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify([existingPool]),
      );
      (fs.writeFileSync as jest.Mock).mockImplementation();
      (fs.renameSync as jest.Mock).mockImplementation();

      await poolService.removePool(
        'solana',
        'mainnet-beta',
        'raydium/amm',
        '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
      );

      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should throw error if pool not found', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('[]');

      await expect(
        poolService.removePool(
          'solana',
          'mainnet-beta',
          'raydium/amm',
          'NonExistentAddress',
        ),
      ).rejects.toThrow('Pool with address NonExistentAddress not found');
    });
  });

  describe('getDefaultPools', () => {
    it('should return pools as key-value pairs', async () => {
      const mockPools = [
        {
          baseTokenSymbol: 'SOL',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/amm',
          network: 'mainnet-beta',
          address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        },
        {
          baseTokenSymbol: 'RAY',
          quoteTokenSymbol: 'USDC',
          connector: 'raydium/amm',
          network: 'mainnet-beta',
          address: '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
        },
      ];

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockPools));

      const defaultPools = await poolService.getDefaultPools(
        'solana',
        'mainnet-beta',
        'raydium/amm',
      );

      expect(defaultPools).toEqual({
        'SOL-USDC': '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        'RAY-USDC': '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
      });
    });

    it('should return empty object on error', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const defaultPools = await poolService.getDefaultPools(
        'solana',
        'mainnet-beta',
        'raydium/amm',
      );

      expect(defaultPools).toEqual({});
    });
  });

  describe('path validation', () => {
    it('should reject path traversal attempts', async () => {
      await expect(
        poolService.loadPoolList('../../etc', 'passwd', 'connector'),
      ).rejects.toThrow();

      await expect(
        poolService.loadPoolList('solana', '../../../etc', 'connector'),
      ).rejects.toThrow();

      await expect(
        poolService.loadPoolList('solana', 'mainnet-beta', '../../../etc'),
      ).rejects.toThrow();
    });

    it('should reject invalid characters in path components', async () => {
      await expect(
        poolService.loadPoolList('sol$ana', 'mainnet-beta', 'raydium/amm'),
      ).rejects.toThrow('Invalid chain name');

      await expect(
        poolService.loadPoolList('solana', 'main@net', 'raydium/amm'),
      ).rejects.toThrow('Invalid network name');
    });
  });
});

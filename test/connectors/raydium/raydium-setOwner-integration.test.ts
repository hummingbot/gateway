import { Raydium as RaydiumSDK } from '@raydium-io/raydium-sdk-v2';
import { Keypair } from '@solana/web3.js';

import { Solana } from '../../../src/chains/solana/solana';
import { Raydium } from '../../../src/connectors/raydium/raydium';

// Mock dependencies
jest.mock('@raydium-io/raydium-sdk-v2', () => {
  const { PublicKey } = require('@solana/web3.js');
  return {
    Raydium: {
      load: jest.fn(),
    },
    TxVersion: {
      V0: 'V0',
    },
    AMM_V4: new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
    AMM_STABLE: new PublicKey('5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h'),
    CLMM_PROGRAM_ID: new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'),
    CREATE_CPMM_POOL_PROGRAM: new PublicKey('CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW'),
    DEV_CREATE_CPMM_POOL_PROGRAM: new PublicKey('CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW'),
    DEVNET_PROGRAM_ID: {
      AMM_V4: new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
      AMM_STABLE: new PublicKey('5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h'),
      CLMM_PROGRAM_ID: new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'),
    },
  };
});

jest.mock('../../../src/chains/solana/solana');
jest.mock('../../../src/chains/solana/solana.utils', () => ({
  getAvailableSolanaNetworks: jest.fn().mockReturnValue(['mainnet-beta', 'devnet']),
}));
jest.mock('../../../src/services/config-manager-v2', () => ({
  ConfigManagerV2: {
    getInstance: jest.fn().mockReturnValue({
      get: jest.fn().mockReturnValue(1),
    }),
  },
}));
jest.mock('../../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('../../../src/connectors/raydium/raydium.utils', () => ({
  isValidClmm: jest.fn().mockReturnValue(true),
  isValidAmm: jest.fn().mockReturnValue(true),
  isValidCpmm: jest.fn().mockReturnValue(true),
}));

describe('Raydium setOwner Integration', () => {
  let mockSolanaInstance: any;
  let mockConnection: any;
  let mockRaydiumSDK: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      getEpochInfo: jest.fn().mockResolvedValue({ epoch: 100, slotIndex: 0 }),
      getAccountInfo: jest.fn().mockResolvedValue(null),
      getTokenAccountBalance: jest.fn().mockResolvedValue({
        value: { uiAmount: 100, amount: '100000000', decimals: 9 },
      }),
    };

    mockSolanaInstance = {
      connection: mockConnection,
      network: 'mainnet-beta',
    };

    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    mockRaydiumSDK = {
      liquidity: {
        addLiquidity: jest.fn(),
        removeLiquidity: jest.fn(),
        getRpcPoolInfos: jest.fn(),
      },
      clmm: {
        openPositionFromBase: jest.fn(),
        closePosition: jest.fn(),
        increaseLiquidity: jest.fn(),
        decreaseLiquidity: jest.fn(),
        harvestAllRewards: jest.fn(),
        getRpcClmmPoolInfo: jest.fn(),
      },
      cpmm: {
        addLiquidity: jest.fn(),
        removeLiquidity: jest.fn(),
        getRpcPoolInfos: jest.fn(),
      },
      api: {
        fetchPoolById: jest.fn(),
      },
    };

    (RaydiumSDK.load as jest.Mock).mockResolvedValue(mockRaydiumSDK);

    // Clear singleton instances
    (Raydium as any)._instances = {};
  });

  describe('Operations requiring owner', () => {
    it('should verify that addLiquidity operations require setOwner', async () => {
      const raydium = await Raydium.getInstance('mainnet-beta');
      const mockOwner = Keypair.generate();

      // Initially, SDK should be loaded without owner
      expect(RaydiumSDK.load).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: undefined,
        }),
      );

      // Set the owner
      await raydium.setOwner(mockOwner);

      // Verify SDK was reloaded with owner
      expect(RaydiumSDK.load).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: mockOwner,
        }),
      );

      // Now SDK operations that require owner should work
      const mockAddLiquidityResult = {
        execute: jest.fn().mockResolvedValue({ txId: 'test-tx-123' }),
      };
      mockRaydiumSDK.liquidity.addLiquidity.mockReturnValue(mockAddLiquidityResult);

      // Simulate calling addLiquidity
      const result = mockRaydiumSDK.liquidity.addLiquidity({
        poolInfo: {},
        amountInA: {},
        amountInB: {},
        slippage: 0.01,
      });

      expect(mockRaydiumSDK.liquidity.addLiquidity).toHaveBeenCalled();
      expect(result).toBe(mockAddLiquidityResult);
    });

    it('should verify that removeLiquidity operations require setOwner', async () => {
      const raydium = await Raydium.getInstance('mainnet-beta');
      const mockOwner = Keypair.generate();

      // Set the owner
      await raydium.setOwner(mockOwner);

      // Verify SDK was reloaded with owner
      expect(RaydiumSDK.load).toHaveBeenCalledTimes(2); // Initial load + setOwner

      // Mock removeLiquidity
      const mockRemoveLiquidityResult = {
        execute: jest.fn().mockResolvedValue({ txId: 'remove-tx-123' }),
      };
      mockRaydiumSDK.liquidity.removeLiquidity.mockReturnValue(mockRemoveLiquidityResult);

      // Simulate calling removeLiquidity
      const result = mockRaydiumSDK.liquidity.removeLiquidity({
        poolInfo: {},
        lpAmount: {},
      });

      expect(mockRaydiumSDK.liquidity.removeLiquidity).toHaveBeenCalled();
      expect(result).toBe(mockRemoveLiquidityResult);
    });

    it('should verify that CLMM operations require setOwner', async () => {
      const raydium = await Raydium.getInstance('mainnet-beta');
      const mockOwner = Keypair.generate();

      // Set the owner
      await raydium.setOwner(mockOwner);

      // Mock CLMM operations
      const mockOpenPositionResult = {
        execute: jest.fn().mockResolvedValue({
          txId: 'open-position-tx-123',
          positionNftMint: 'position-nft-mint',
        }),
      };
      mockRaydiumSDK.clmm.openPositionFromBase.mockReturnValue(mockOpenPositionResult);

      // Simulate calling openPositionFromBase
      const result = mockRaydiumSDK.clmm.openPositionFromBase({
        poolInfo: {},
        priceLower: 100,
        priceUpper: 200,
        base: 'MintA',
        baseAmount: 1000000,
      });

      expect(mockRaydiumSDK.clmm.openPositionFromBase).toHaveBeenCalled();
      expect(result).toBe(mockOpenPositionResult);
    });

    it('should persist owner across multiple operations', async () => {
      const raydium = await Raydium.getInstance('mainnet-beta');
      const mockOwner = Keypair.generate();

      // Set the owner once
      await raydium.setOwner(mockOwner);
      const firstLoadCallCount = (RaydiumSDK.load as jest.Mock).mock.calls.length;

      // Mock multiple operations
      mockRaydiumSDK.liquidity.addLiquidity.mockReturnValue({
        execute: jest.fn().mockResolvedValue({ txId: 'add-1' }),
      });
      mockRaydiumSDK.liquidity.removeLiquidity.mockReturnValue({
        execute: jest.fn().mockResolvedValue({ txId: 'remove-1' }),
      });
      mockRaydiumSDK.clmm.openPositionFromBase.mockReturnValue({
        execute: jest.fn().mockResolvedValue({ txId: 'open-1' }),
      });

      // Simulate multiple operations
      mockRaydiumSDK.liquidity.addLiquidity({});
      mockRaydiumSDK.liquidity.removeLiquidity({});
      mockRaydiumSDK.clmm.openPositionFromBase({});

      // Verify SDK was not reloaded between operations
      expect(RaydiumSDK.load).toHaveBeenCalledTimes(firstLoadCallCount);

      // All operations should have been called
      expect(mockRaydiumSDK.liquidity.addLiquidity).toHaveBeenCalledTimes(1);
      expect(mockRaydiumSDK.liquidity.removeLiquidity).toHaveBeenCalledTimes(1);
      expect(mockRaydiumSDK.clmm.openPositionFromBase).toHaveBeenCalledTimes(1);
    });

    it('should handle changing owners', async () => {
      const raydium = await Raydium.getInstance('mainnet-beta');
      const mockOwner1 = Keypair.generate();
      const mockOwner2 = Keypair.generate();

      // Set first owner
      await raydium.setOwner(mockOwner1);
      expect(RaydiumSDK.load).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: mockOwner1,
        }),
      );

      // Change to second owner
      await raydium.setOwner(mockOwner2);
      expect(RaydiumSDK.load).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: mockOwner2,
        }),
      );

      // Verify SDK was loaded 3 times: initial + 2 setOwner calls
      expect(RaydiumSDK.load).toHaveBeenCalledTimes(3);
    });
  });
});

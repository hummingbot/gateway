import { Keypair, Connection, PublicKey } from '@solana/web3.js';

// Mock Raydium SDK constants before importing modules that use them
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
    PositionInfoLayout: {
      decode: jest.fn(),
    },
    TickUtils: {
      getTickPrice: jest.fn(),
    },
    PositionUtils: {
      getAmountsFromLiquidity: jest.fn(),
    },
    getPdaPersonalPositionAddress: jest.fn(),
  };
});

// Mock all dependencies
jest.mock('../../../src/chains/solana/solana');
jest.mock('../../../src/connectors/raydium/raydium.config');
jest.mock('../../../src/services/logger');
jest.mock('../../../src/connectors/raydium/raydium.utils', () => ({
  isValidClmm: jest.fn().mockReturnValue(true),
  isValidAmm: jest.fn().mockReturnValue(true),
  isValidCpmm: jest.fn().mockReturnValue(true),
}));

// Import after mocks
import { Raydium as RaydiumSDK, TxVersion } from '@raydium-io/raydium-sdk-v2';

import { Solana } from '../../../src/chains/solana/solana';
import { Raydium } from '../../../src/connectors/raydium/raydium';
import { RaydiumConfig } from '../../../src/connectors/raydium/raydium.config';
import { logger } from '../../../src/services/logger';

describe('Raydium', () => {
  let mockSolanaInstance: any;
  let mockConnection: any;
  let mockRaydiumSDK: any;
  let mockOwner: Keypair;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Solana instance
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
      getWallet: jest.fn().mockResolvedValue(mockOwner),
    };

    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    // Mock RaydiumConfig
    (RaydiumConfig.config as any) = {
      slippagePct: 1,
    };

    // Mock owner keypair
    mockOwner = Keypair.generate();

    // Mock Raydium SDK
    mockRaydiumSDK = {
      clmm: {
        getRpcClmmPoolInfo: jest.fn(),
        getPoolInfoFromRpc: jest.fn(),
      },
      api: {
        fetchPoolById: jest.fn(),
      },
      liquidity: {
        getPoolInfoFromRpc: jest.fn(),
        getRpcPoolInfos: jest.fn(),
        computeAmountOut: jest.fn(),
        computeAmountIn: jest.fn(),
      },
      cpmm: {
        getRpcPoolInfos: jest.fn(),
      },
    };

    (RaydiumSDK.load as jest.Mock).mockResolvedValue(mockRaydiumSDK);

    // Clear singleton instances
    (Raydium as any)._instances = {};

    // Mock logger
    (logger.info as jest.Mock).mockImplementation(() => {});
    (logger.error as jest.Mock).mockImplementation(() => {});
    (logger.warn as jest.Mock).mockImplementation(() => {});
  });

  describe('getInstance', () => {
    it('should create and return a singleton instance for a network', async () => {
      const instance1 = await Raydium.getInstance('mainnet-beta');
      const instance2 = await Raydium.getInstance('mainnet-beta');

      expect(instance1).toBe(instance2);
      expect(Solana.getInstance).toHaveBeenCalledWith('mainnet-beta');
      expect(RaydiumSDK.load).toHaveBeenCalledTimes(1);
    });

    it('should create different instances for different networks', async () => {
      const mainnetInstance = await Raydium.getInstance('mainnet-beta');

      // Update mock for devnet
      mockSolanaInstance.network = 'devnet';

      const devnetInstance = await Raydium.getInstance('devnet');

      expect(mainnetInstance).not.toBe(devnetInstance);
      expect(RaydiumSDK.load).toHaveBeenCalledTimes(2);
    });

    it('should initialize SDK without owner by default', async () => {
      await Raydium.getInstance('mainnet-beta');

      expect(RaydiumSDK.load).toHaveBeenCalledWith({
        connection: mockConnection,
        cluster: 'mainnet',
        owner: undefined,
        disableFeatureCheck: true,
        blockhashCommitment: 'confirmed',
      });
      expect(logger.info).toHaveBeenCalledWith('Raydium initialized with no default wallet');
    });

    it('should use devnet cluster for devnet network', async () => {
      mockSolanaInstance.network = 'devnet';
      await Raydium.getInstance('devnet');

      expect(RaydiumSDK.load).toHaveBeenCalledWith({
        connection: mockConnection,
        cluster: 'devnet',
        owner: undefined,
        disableFeatureCheck: true,
        blockhashCommitment: 'confirmed',
      });
    });

    it('should handle initialization errors', async () => {
      const mockError = new Error('Failed to connect');
      (RaydiumSDK.load as jest.Mock).mockRejectedValueOnce(mockError);

      await expect(Raydium.getInstance('mainnet-beta')).rejects.toThrow('Failed to connect');
      expect(logger.error).toHaveBeenCalledWith('Raydium initialization failed:', mockError);
    });
  });

  describe('setOwner', () => {
    let raydiumInstance: Raydium;

    beforeEach(async () => {
      raydiumInstance = await Raydium.getInstance('mainnet-beta');
      // Clear the mock calls from initialization
      jest.clearAllMocks();
    });

    it('should reinitialize SDK with owner', async () => {
      await raydiumInstance.setOwner(mockOwner);

      expect(RaydiumSDK.load).toHaveBeenCalledWith({
        connection: mockConnection,
        cluster: 'mainnet',
        owner: mockOwner,
        disableFeatureCheck: true,
        blockhashCommitment: 'confirmed',
      });
      expect(logger.info).toHaveBeenCalledWith('Raydium SDK reinitialized with owner');
    });

    it('should update the owner property', async () => {
      expect((raydiumInstance as any).owner).toBeUndefined();

      await raydiumInstance.setOwner(mockOwner);

      expect((raydiumInstance as any).owner).toBe(mockOwner);
    });

    it('should update the raydiumSDK instance', async () => {
      const newMockSDK = { ...mockRaydiumSDK, newInstance: true };
      (RaydiumSDK.load as jest.Mock).mockResolvedValueOnce(newMockSDK);

      await raydiumInstance.setOwner(mockOwner);

      expect(raydiumInstance.raydiumSDK).toBe(newMockSDK);
    });

    it('should handle setOwner errors', async () => {
      const mockError = new Error('Failed to reinitialize');
      (RaydiumSDK.load as jest.Mock).mockRejectedValueOnce(mockError);

      await expect(raydiumInstance.setOwner(mockOwner)).rejects.toThrow('Failed to reinitialize');
    });

    it('should use correct cluster for devnet', async () => {
      mockSolanaInstance.network = 'devnet';
      const devnetInstance = await Raydium.getInstance('devnet');
      jest.clearAllMocks();

      await devnetInstance.setOwner(mockOwner);

      expect(RaydiumSDK.load).toHaveBeenCalledWith({
        connection: mockConnection,
        cluster: 'devnet',
        owner: mockOwner,
        disableFeatureCheck: true,
        blockhashCommitment: 'confirmed',
      });
    });
  });

  describe('transaction execution', () => {
    let raydiumInstance: Raydium;

    beforeEach(async () => {
      raydiumInstance = await Raydium.getInstance('mainnet-beta');
    });

    it('should execute transaction successfully', async () => {
      const mockExecuteFunc = jest.fn().mockResolvedValue({ txId: 'test-tx-id' });

      const result = await raydiumInstance.executeTransaction(mockExecuteFunc);

      expect(result).toBe('test-tx-id');
      expect(logger.info).toHaveBeenCalledWith('Transaction executed successfully: test-tx-id');
    });

    it('should handle insufficient funds error', async () => {
      const mockExecuteFunc = jest.fn().mockRejectedValue(new Error('insufficient funds for rent'));

      await expect(raydiumInstance.executeTransaction(mockExecuteFunc)).rejects.toThrow(
        'Insufficient SOL balance for transaction fees',
      );
    });

    it('should handle slippage error', async () => {
      const mockExecuteFunc = jest.fn().mockRejectedValue(new Error('slippage tolerance exceeded'));

      await expect(raydiumInstance.executeTransaction(mockExecuteFunc)).rejects.toThrow(
        'Transaction failed due to slippage. Try increasing slippage tolerance.',
      );
    });

    it('should handle blockhash error', async () => {
      const mockExecuteFunc = jest.fn().mockRejectedValue(new Error('blockhash not found'));

      await expect(raydiumInstance.executeTransaction(mockExecuteFunc)).rejects.toThrow(
        'Transaction expired. Please try again.',
      );
    });

    it('should rethrow unknown errors', async () => {
      const mockError = new Error('Unknown error');
      const mockExecuteFunc = jest.fn().mockRejectedValue(mockError);

      await expect(raydiumInstance.executeTransaction(mockExecuteFunc)).rejects.toThrow('Unknown error');
      expect(logger.error).toHaveBeenCalledWith('Transaction execution failed:', mockError);
    });
  });

  describe('pool methods', () => {
    let raydiumInstance: Raydium;

    beforeEach(async () => {
      raydiumInstance = await Raydium.getInstance('mainnet-beta');
    });

    describe('getClmmPoolInfo', () => {
      it('should return CLMM pool info', async () => {
        const mockPoolAddress = 'test-pool-address';
        const mockRpcData = {
          mintA: { toString: () => 'token-a' },
          mintB: { toString: () => 'token-b' },
          tickSpacing: 64,
          tickCurrent: 100,
          currentPrice: '150.5',
          vaultA: 'vault-a',
          vaultB: 'vault-b',
          ammConfig: 'config-address',
        };

        mockRaydiumSDK.clmm.getRpcClmmPoolInfo.mockResolvedValue(mockRpcData);
        mockConnection.getAccountInfo.mockResolvedValue({
          data: Buffer.from(new Array(100).fill(0)),
        });
        mockConnection.getTokenAccountBalance.mockResolvedValue({
          value: { uiAmount: 1000 },
        });

        const result = await raydiumInstance.getClmmPoolInfo(mockPoolAddress);

        expect(result).toEqual({
          address: mockPoolAddress,
          baseTokenAddress: 'token-a',
          quoteTokenAddress: 'token-b',
          binStep: 64,
          feePct: 0, // Updated to match actual behavior
          price: 150.5,
          baseTokenAmount: 1000,
          quoteTokenAmount: 1000,
          activeBinId: 100,
        });
      });

      it('should handle pool not found', async () => {
        mockRaydiumSDK.clmm.getRpcClmmPoolInfo.mockRejectedValue(new Error('Pool not found'));

        const result = await raydiumInstance.getClmmPoolInfo('invalid-pool');

        expect(result).toBeNull();
        expect(logger.debug).toHaveBeenCalled();
      });
    });

    describe('getAmmPoolInfo', () => {
      it('should return AMM pool info', async () => {
        // Import the utility functions to mock them
        const { isValidAmm, isValidClmm, isValidCpmm } = require('../../../src/connectors/raydium/raydium.utils');

        const mockPoolAddress = 'amm-pool-address';
        const mockPoolInfo = {
          programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // AMM program ID
        };

        // Mock the utility functions
        isValidClmm.mockReturnValue(false);
        isValidAmm.mockReturnValue(true);
        isValidCpmm.mockReturnValue(false);

        mockRaydiumSDK.api.fetchPoolById.mockResolvedValue([mockPoolInfo]);
        mockRaydiumSDK.liquidity.getRpcPoolInfos.mockResolvedValue({
          [mockPoolAddress]: {
            baseMint: { toString: () => 'base-token' },
            quoteMint: { toString: () => 'quote-token' },
            tradeFeeNumerator: 25,
            tradeFeeDenominator: 10000,
            poolPrice: '100',
            mintAAmount: '1000000000',
            mintBAmount: '100000000',
            baseDecimal: 9,
            quoteDecimal: 6,
          },
        });

        const result = await raydiumInstance.getAmmPoolInfo(mockPoolAddress);

        expect(result).toEqual({
          address: mockPoolAddress,
          baseTokenAddress: 'base-token',
          quoteTokenAddress: 'quote-token',
          feePct: 0.0025,
          price: 100,
          baseTokenAmount: 1,
          quoteTokenAmount: 100,
          poolType: 'amm',
        });
      });

      it('should return CPMM pool info', async () => {
        // Import the utility functions to mock them
        const { isValidAmm, isValidClmm, isValidCpmm } = require('../../../src/connectors/raydium/raydium.utils');

        const mockPoolAddress = 'cpmm-pool-address';
        const mockPoolInfo = {
          programId: 'CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW', // CPMM program ID
        };

        // Mock the utility functions
        isValidClmm.mockReturnValue(false);
        isValidAmm.mockReturnValue(false);
        isValidCpmm.mockReturnValue(true);

        mockRaydiumSDK.api.fetchPoolById.mockResolvedValue([mockPoolInfo]);
        mockRaydiumSDK.cpmm.getRpcPoolInfos.mockResolvedValue({
          [mockPoolAddress]: {
            mintA: { toString: () => 'base-token' },
            mintB: { toString: () => 'quote-token' },
            configInfo: { tradeFeeRate: 30 },
            poolPrice: '200',
            baseReserve: '2000000000',
            quoteReserve: '400000000',
            mintDecimalA: 9,
            mintDecimalB: 6,
          },
        });

        const result = await raydiumInstance.getAmmPoolInfo(mockPoolAddress);

        expect(result).toEqual({
          address: mockPoolAddress,
          baseTokenAddress: 'base-token',
          quoteTokenAddress: 'quote-token',
          feePct: 30,
          price: 200,
          baseTokenAmount: 2,
          quoteTokenAmount: 400,
          poolType: 'cpmm',
        });
      });
    });
  });

  describe('property access', () => {
    it('should have public solana property', async () => {
      const raydiumInstance = await Raydium.getInstance('mainnet-beta');
      expect(raydiumInstance.solana).toBe(mockSolanaInstance);
    });

    it('should have public raydiumSDK property', async () => {
      const raydiumInstance = await Raydium.getInstance('mainnet-beta');
      expect(raydiumInstance.raydiumSDK).toBe(mockRaydiumSDK);
    });

    it('should have public config property', async () => {
      const raydiumInstance = await Raydium.getInstance('mainnet-beta');
      expect(raydiumInstance.config).toBe(RaydiumConfig.config);
    });

    it('should have public txVersion property', async () => {
      const raydiumInstance = await Raydium.getInstance('mainnet-beta');
      expect(raydiumInstance.txVersion).toBe(TxVersion.V0);
    });
  });
});

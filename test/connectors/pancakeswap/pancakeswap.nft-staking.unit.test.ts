/**
 * Pancakeswap NFT Staking — Unit Tests
 *
 * Tests the four methods added to the Pancakeswap class for MasterChef staking:
 *   - getV3PoolIdFromMasterChef
 *   - getPoolMasterchefData
 *   - stakeNft
 *   - unstakeNft
 *
 * The Pancakeswap instance is constructed via Object.create() to bypass init(),
 * then private fields are injected directly. All external dependencies
 * (ethers Contract, Ethereum chain, wallet) are mocked.
 */

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted before all imports)
// ---------------------------------------------------------------------------

jest.mock('../../../src/services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  redactUrl: jest.fn((u: string) => u),
  updateLoggerToStdout: jest.fn(),
}));

jest.mock('../../../src/services/config-manager-v2', () => ({
  ConfigManagerV2: {
    getInstance: jest.fn().mockReturnValue({
      get: jest.fn().mockReturnValue(undefined),
    }),
  },
}));

jest.mock('../../../src/services/config-manager-cert-passphrase', () => ({
  ConfigManagerCertPassphrase: { readPassphrase: jest.fn().mockReturnValue('test') },
}));

jest.mock('../../../src/https', () => ({ getHttpsOptions: jest.fn().mockReturnValue(null) }));

// Mock Ethereum chain
const mockProvider = {};
const mockWallet = { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f42e0E' };
const mockEthereum = {
  chainId: 56,
  provider: mockProvider,
  ready: jest.fn().mockReturnValue(true),
  init: jest.fn().mockResolvedValue(undefined),
  getWallet: jest.fn().mockResolvedValue(mockWallet),
  getToken: jest.fn(),
};

jest.mock('../../../src/chains/ethereum/ethereum', () => ({
  Ethereum: {
    getInstance: jest.fn().mockReturnValue(mockEthereum),
    getFirstWalletAddress: jest.fn().mockResolvedValue('0x742d35Cc6634C0532925a3b844Bc9e7595f42e0E'),
  },
}));

// Mock all ABI imports and contract address helpers
jest.mock('../../../src/connectors/pancakeswap/pancakeswap.contracts', () => ({
  IPancakeswapV2PairABI: { abi: [] },
  IPancakeswapV2FactoryABI: { abi: [] },
  IPancakeswapV2Router02ABI: { abi: [] },
  POSITION_MANAGER_ABI: [],
  getPancakeswapV3MasterchefAddress: jest.fn().mockReturnValue('0xMasterChefAddr'),
  getPancakeswapV3NftManagerAddress: jest.fn().mockReturnValue('0xNftManagerAddr'),
  getPancakeswapV3QuoterV2ContractAddress: jest.fn().mockReturnValue('0xQuoterAddr'),
  getPancakeswapV3FactoryAddress: jest.fn().mockReturnValue('0xFactoryAddr'),
  getPancakeswapV2FactoryAddress: jest.fn().mockReturnValue('0xV2FactoryAddr'),
  getPancakeswapSmartRouterAddress: jest.fn().mockReturnValue('0xSmartRouterAddr'),
  getPancakeswapV2RouterAddress: jest.fn().mockReturnValue('0xV2RouterAddr'),
}));

jest.mock('../../../src/connectors/pancakeswap/pancakeswap.utils', () => ({
  isValidV2Pool: jest.fn().mockResolvedValue(true),
  isValidV3Pool: jest.fn().mockResolvedValue(true),
  formatTokenAmount: jest.fn().mockReturnValue(0),
}));

jest.mock('../../../src/connectors/pancakeswap/PancakeswapV3Masterchef.abi.json', () => [], {
  virtual: true,
});

jest.mock('../../../src/connectors/pancakeswap/universal-router', () => ({
  UniversalRouterService: jest.fn().mockImplementation(() => ({ getQuote: jest.fn() })),
}));

jest.mock('../../../src/connectors/pancakeswap/pancakeswap.config', () => ({
  PancakeswapConfig: {
    config: jest.fn().mockReturnValue({
      slippagePct: 0.5,
      maximumHops: 3,
      maximumSplits: 1,
      network: 'bsc',
      networks: ['bsc'],
    }),
    RootConfig: class {},
  },
}));

// Mock @pancakeswap v3-core ABI JSON files
jest.mock(
  '@pancakeswap/v3-core/artifacts/contracts/interfaces/IPancakeV3Factory.sol/IPancakeV3Factory.json',
  () => ({ abi: [] }),
  { virtual: true },
);
jest.mock(
  '@pancakeswap/v3-core/artifacts/contracts/interfaces/IPancakeV3Pool.sol/IPancakeV3Pool.json',
  () => ({ abi: [] }),
  { virtual: true },
);

// Mock @pancakeswap/* SDK packages with minimal shims
jest.mock('@pancakeswap/sdk', () => ({
  Token: jest
    .fn()
    .mockImplementation((chainId: number, address: string, decimals: number, symbol: string, name: string) => ({
      chainId,
      address,
      decimals,
      symbol,
      name,
    })),
  CurrencyAmount: {
    fromRawAmount: jest.fn().mockReturnValue({ toSignificant: jest.fn().mockReturnValue('1.0') }),
  },
  Percent: jest.fn().mockImplementation((n: number, d: number) => ({ numerator: n, denominator: d })),
  TradeType: { EXACT_INPUT: 0, EXACT_OUTPUT: 1 },
}));

jest.mock('@pancakeswap/v2-sdk', () => ({ Pair: jest.fn() }));

jest.mock('@pancakeswap/v3-sdk', () => ({
  FeeAmount: { LOWEST: 100, LOW: 500, MEDIUM: 2500, HIGH: 10000 },
  Pool: jest.fn().mockImplementation(() => ({
    token0Price: { toSignificant: jest.fn().mockReturnValue('2.45') },
    token1Price: { toSignificant: jest.fn().mockReturnValue('0.408') },
    tickCurrent: 0,
  })),
  NonfungiblePositionManager: {},
  Position: jest.fn(),
  tickToPrice: jest.fn().mockReturnValue({
    toSignificant: jest.fn().mockReturnValue('1.0'),
    invert: jest.fn().mockReturnValue({ toSignificant: jest.fn().mockReturnValue('1.0') }),
  }),
}));

jest.mock('@pancakeswap/smart-router', () => ({
  PoolType: { V2: 'V2', V3: 'V3' },
  SmartRouter: {},
}));

// Mock ethers
const MockContract = jest.fn();

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    Contract: MockContract,
    constants: { AddressZero: '0x0000000000000000000000000000000000000000' },
    utils: {
      ...actual.utils,
      Interface: jest.fn().mockImplementation(() => ({
        parseLog: jest.fn(),
      })),
    },
  };
});

// ---------------------------------------------------------------------------
// Import (after mocks are registered)
// ---------------------------------------------------------------------------
import { Pancakeswap } from '../../../src/connectors/pancakeswap/pancakeswap';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const WALLET = '0x742d35Cc6634C0532925a3b844Bc9e7595f42e0E';
const TOKEN_ID = 6350589;
const POOL_ADDRESS = '0xA5067360b13Fc7A2685Dc82dcD1bF2B4B8D7868B';
const MASTERCHEF_ADDR = '0xMasterChefAddr';
const CAKE_ADDR = '0xCakeTokenAddr';

// ---------------------------------------------------------------------------
// Helper: build a minimal Pancakeswap instance bypassing init()
// ---------------------------------------------------------------------------
function makePancakeswapInstance(): Pancakeswap {
  const inst = Object.create(Pancakeswap.prototype) as Pancakeswap;

  (inst as any).networkName = 'bsc';
  (inst as any).ethereum = mockEthereum;
  (inst as any)._ready = true;
  (inst as any).chainId = 56;
  (inst as any).config = { slippagePct: 0.5, maximumHops: 3, maximumSplits: 1 };

  // masterChef placeholder; overridden per-test
  (inst as any).masterChef = {
    address: MASTERCHEF_ADDR,
    connect: jest.fn(),
    v3PoolAddressPid: jest.fn(),
    getLatestPeriodInfo: jest.fn(),
    CAKE: jest.fn(),
  };

  // v3Factory stub
  (inst as any).v3Factory = {
    getPool: jest.fn().mockResolvedValue(POOL_ADDRESS),
  };

  return inst;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
describe('Pancakeswap — NFT Staking unit tests', () => {
  let ps: Pancakeswap;

  beforeEach(() => {
    jest.clearAllMocks();
    MockContract.mockReset();
    ps = makePancakeswapInstance();
  });

  // =========================================================================
  // getV3PoolIdFromMasterChef
  // =========================================================================
  describe('getV3PoolIdFromMasterChef', () => {
    it('returns the numeric pool ID for a registered pool', async () => {
      MockContract.mockImplementationOnce(() => ({
        v3PoolAddressPid: jest.fn().mockResolvedValue(BigInt(3)),
      }));
      expect(await ps.getV3PoolIdFromMasterChef(POOL_ADDRESS)).toBe(3);
    });

    it('returns 0 for an unregistered pool', async () => {
      MockContract.mockImplementationOnce(() => ({
        v3PoolAddressPid: jest.fn().mockResolvedValue(BigInt(0)),
      }));
      expect(await ps.getV3PoolIdFromMasterChef(POOL_ADDRESS)).toBe(0);
    });

    it('propagates contract call errors', async () => {
      MockContract.mockImplementationOnce(() => ({
        v3PoolAddressPid: jest.fn().mockRejectedValue(new Error('call reverted')),
      }));
      await expect(ps.getV3PoolIdFromMasterChef(POOL_ADDRESS)).rejects.toThrow('call reverted');
    });

    it('handles large pool IDs correctly', async () => {
      MockContract.mockImplementationOnce(() => ({
        v3PoolAddressPid: jest.fn().mockResolvedValue(BigInt(255)),
      }));
      expect(await ps.getV3PoolIdFromMasterChef(POOL_ADDRESS)).toBe(255);
    });

    it('converts BigInt result to a JS number', async () => {
      MockContract.mockImplementationOnce(() => ({
        v3PoolAddressPid: jest.fn().mockResolvedValue(BigInt(42)),
      }));
      const pid = await ps.getV3PoolIdFromMasterChef(POOL_ADDRESS);
      expect(typeof pid).toBe('number');
      expect(pid).toBe(42);
    });
  });

  // =========================================================================
  // getPoolMasterchefData
  // =========================================================================
  describe('getPoolMasterchefData', () => {
    const futureTs = Math.floor(Date.now() / 1000) + 86400;
    const pastTs = Math.floor(Date.now() / 1000) - 1000;

    function setupMc({ pid = BigInt(3), cakeWei = BigInt('4230000000000000'), endTs = futureTs } = {}) {
      (ps as any).masterChef.getLatestPeriodInfo = jest.fn().mockResolvedValue([cakeWei, BigInt(endTs)]);
      MockContract.mockImplementationOnce(() => ({
        v3PoolAddressPid: jest.fn().mockResolvedValue(pid),
      }));
    }

    it('returns correct poolId, cakePerSecond, rewardEndTime, isRewardActive', async () => {
      setupMc();
      const d = await ps.getPoolMasterchefData(POOL_ADDRESS);
      expect(d.poolId).toBe(3);
      expect(d.cakePerSecond).toBeCloseTo(0.00423, 5);
      expect(d.rewardEndTime).toBe(futureTs);
      expect(d.isRewardActive).toBe(true);
    });

    it('returns isRewardActive=false when reward period has ended', async () => {
      setupMc({ endTs: pastTs });
      const d = await ps.getPoolMasterchefData(POOL_ADDRESS);
      expect(d.isRewardActive).toBe(false);
    });

    it('returns safe zero defaults when contract call fails', async () => {
      (ps as any).masterChef.getLatestPeriodInfo = jest.fn().mockRejectedValue(new Error('RPC timeout'));
      MockContract.mockImplementationOnce(() => ({
        v3PoolAddressPid: jest.fn().mockResolvedValue(BigInt(0)),
      }));
      const d = await ps.getPoolMasterchefData(POOL_ADDRESS);
      expect(d).toEqual({ poolId: 0, cakePerSecond: 0, rewardEndTime: 0, isRewardActive: false });
    });

    it('converts 1e18 wei cakePerSecond to 1.0', async () => {
      setupMc({ cakeWei: BigInt('1000000000000000000') });
      const d = await ps.getPoolMasterchefData(POOL_ADDRESS);
      expect(d.cakePerSecond).toBeCloseTo(1.0, 6);
    });

    it('handles zero cakePerSecond', async () => {
      setupMc({ cakeWei: BigInt(0) });
      const d = await ps.getPoolMasterchefData(POOL_ADDRESS);
      expect(d.cakePerSecond).toBe(0);
    });

    it('isRewardActive=false when endTime is exactly 1 second in the past', async () => {
      setupMc({ endTs: Math.floor(Date.now() / 1000) - 1 });
      const d = await ps.getPoolMasterchefData(POOL_ADDRESS);
      expect(d.isRewardActive).toBe(false);
    });
  });

  // =========================================================================
  // stakeNft
  // =========================================================================
  describe('stakeNft', () => {
    const defaultPos = {
      token0: '0xToken0Addr',
      token1: '0xToken1Addr',
      fee: 2500,
      tickLower: -887272,
      tickUpper: 887272,
      liquidity: BigInt('987654321098765'),
    };

    function setupHappyPath({ liquidity = defaultPos.liquidity, poolId = BigInt(3), txStatus = 1 } = {}) {
      const txHash = '0xstakeTxHash';
      const mockTx = {
        hash: txHash,
        wait: jest.fn().mockResolvedValue({ status: txStatus, logs: [] }),
      };

      // stakeNft first calls checkNFTOwnership, which creates its own Contract
      // 1. checkNFTOwnership Contract → ownerOf
      MockContract.mockImplementationOnce(() => ({
        ownerOf: jest.fn().mockResolvedValue(WALLET),
      }));
      // 2. positionContract
      MockContract.mockImplementationOnce(() => ({
        positions: jest.fn().mockResolvedValue({ ...defaultPos, liquidity }),
      }));
      // 3. v3Factory.getPool (via getV3PoolByTokens — uses this.v3Factory, no new Contract)
      // 4. masterChef pid
      MockContract.mockImplementationOnce(() => ({
        v3PoolAddressPid: jest.fn().mockResolvedValue(poolId),
      }));
      // 5. ownerOf (pre-transfer check)
      MockContract.mockImplementationOnce(() => ({
        ownerOf: jest.fn().mockResolvedValue(WALLET),
      }));
      // 6. isApprovedForAll
      MockContract.mockImplementationOnce(() => ({
        isApprovedForAll: jest.fn().mockResolvedValue(true),
      }));
      // 7. safeTransferFrom (wallet-connected)
      MockContract.mockImplementationOnce(() => ({
        'safeTransferFrom(address,address,uint256)': jest.fn().mockResolvedValue(mockTx),
      }));

      // Token lookups
      mockEthereum.getToken
        .mockResolvedValueOnce({ address: '0xToken0Addr', symbol: 'CAKE', decimals: 18, name: 'CAKE' })
        .mockResolvedValueOnce({ address: '0xToken1Addr', symbol: 'USDT', decimals: 18, name: 'USDT' });

      // getPoolMasterchefData
      (ps as any).masterChef = {
        address: MASTERCHEF_ADDR,
        getLatestPeriodInfo: jest
          .fn()
          .mockResolvedValue([BigInt('4230000000000000'), BigInt(Math.floor(Date.now() / 1000) + 86400)]),
      };
      MockContract.mockImplementationOnce(() => ({
        v3PoolAddressPid: jest.fn().mockResolvedValue(poolId),
      }));

      // getV3Pool pool contract
      MockContract.mockImplementationOnce(() => ({
        liquidity: jest.fn().mockResolvedValue(BigInt('1000000000')),
        slot0: jest.fn().mockResolvedValue([BigInt('79228162514264337593543950336'), 0, 0, 0, 0, 0, true]),
        fee: jest.fn().mockResolvedValue(2500),
      }));

      return { txHash };
    }

    it('returns all expected fields on success', async () => {
      const { txHash } = setupHappyPath();
      const r = await ps.stakeNft(TOKEN_ID, WALLET);

      expect(r.txHash).toBe(txHash);
      expect(r.poolAddress).toBe(POOL_ADDRESS);
      expect(r.liquidity).toBe('987654321098765');
      expect(r.tickLower).toBe(-887272);
      expect(r.tickUpper).toBe(887272);
      expect(r.feePct).toBeCloseTo(0.25, 4);
      expect(typeof r.cakePerSecond).toBe('number');
      expect(typeof r.rewardEndTime).toBe('number');
      expect(typeof r.isRewardActive).toBe('boolean');
    });

    it('feePct equals fee / 10000', async () => {
      setupHappyPath();
      const r = await ps.stakeNft(TOKEN_ID, WALLET);
      expect(r.feePct).toBeCloseTo(2500 / 10000, 6);
    });

    it('loads wallet from ethereum.getWallet', async () => {
      setupHappyPath();
      await ps.stakeNft(TOKEN_ID, WALLET);
      expect(mockEthereum.getWallet).toHaveBeenCalledWith(WALLET);
    });

    it('throws "zero liquidity" when position liquidity is 0', async () => {
      MockContract.mockImplementationOnce(() => ({ ownerOf: jest.fn().mockResolvedValue(WALLET) })) // checkNFTOwnership
        .mockImplementationOnce(() => ({
          positions: jest.fn().mockResolvedValue({ ...defaultPos, liquidity: BigInt(0) }),
        }));
      await expect(ps.stakeNft(TOKEN_ID, WALLET)).rejects.toThrow('zero liquidity');
    });

    it('throws "not registered in MasterChef" when poolId is 0', async () => {
      MockContract.mockImplementationOnce(() => ({ ownerOf: jest.fn().mockResolvedValue(WALLET) })) // checkNFTOwnership
        .mockImplementationOnce(() => ({ positions: jest.fn().mockResolvedValue(defaultPos) }))
        .mockImplementationOnce(() => ({ v3PoolAddressPid: jest.fn().mockResolvedValue(BigInt(0)) }));
      await expect(ps.stakeNft(TOKEN_ID, WALLET)).rejects.toThrow('not registered in MasterChef');
    });

    it('throws "already staked" when NFT owner is MasterChef contract', async () => {
      MockContract.mockImplementationOnce(() => ({ ownerOf: jest.fn().mockResolvedValue(WALLET) })) // checkNFTOwnership
        .mockImplementationOnce(() => ({ positions: jest.fn().mockResolvedValue(defaultPos) }))
        .mockImplementationOnce(() => ({ v3PoolAddressPid: jest.fn().mockResolvedValue(BigInt(3)) }))
        .mockImplementationOnce(() => ({ ownerOf: jest.fn().mockResolvedValue(MASTERCHEF_ADDR) }));
      await expect(ps.stakeNft(TOKEN_ID, WALLET)).rejects.toThrow('already staked');
    });

    it('throws when MasterChef is not approved (isApprovedForAll=false)', async () => {
      MockContract.mockImplementationOnce(() => ({ ownerOf: jest.fn().mockResolvedValue(WALLET) })) // checkNFTOwnership
        .mockImplementationOnce(() => ({ positions: jest.fn().mockResolvedValue(defaultPos) }))
        .mockImplementationOnce(() => ({ v3PoolAddressPid: jest.fn().mockResolvedValue(BigInt(3)) }))
        .mockImplementationOnce(() => ({ ownerOf: jest.fn().mockResolvedValue(WALLET) }))
        .mockImplementationOnce(() => ({ isApprovedForAll: jest.fn().mockResolvedValue(false) }));
      await expect(ps.stakeNft(TOKEN_ID, WALLET)).rejects.toThrow('not approved');
    });

    it('throws "Staking transaction failed" when tx status is 0', async () => {
      setupHappyPath({ txStatus: 0 });
      await expect(ps.stakeNft(TOKEN_ID, WALLET)).rejects.toThrow('Staking transaction failed');
    });

    it('throws when getPool returns zero address (pool not found)', async () => {
      // Override v3Factory to return zero address so getV3PoolByTokens returns null
      (ps as any).v3Factory = { getPool: jest.fn().mockResolvedValue('0x0000000000000000000000000000000000000000') };
      MockContract.mockImplementationOnce(() => ({ ownerOf: jest.fn().mockResolvedValue(WALLET) })) // checkNFTOwnership
        .mockImplementationOnce(() => ({ positions: jest.fn().mockResolvedValue(defaultPos) }));
      await expect(ps.stakeNft(TOKEN_ID, WALLET)).rejects.toThrow();
    });
  });

  // =========================================================================
  // unstakeNft
  // =========================================================================
  describe('unstakeNft', () => {
    const TX_HASH = '0xunstakeTxHash';

    function setupUnstakeMocks({
      rewardWei = BigInt('12345678000000000000'),
      includeHarvestLog = true,
      harvestParseSuccess = true,
    } = {}) {
      const mockTx = {
        hash: TX_HASH,
        wait: jest.fn().mockResolvedValue({
          status: 1,
          logs: includeHarvestLog ? [{ topics: [], data: '0x' }] : [],
        }),
      };

      const mockWithdraw = jest.fn().mockResolvedValue(mockTx);
      const mockConnect = jest.fn().mockReturnValue({ withdraw: mockWithdraw });

      (ps as any).masterChef = {
        address: MASTERCHEF_ADDR,
        connect: mockConnect,
        CAKE: jest.fn().mockResolvedValue(CAKE_ADDR),
      };

      const { utils } = jest.requireMock('ethers');
      utils.Interface.mockImplementation(() => ({
        parseLog: harvestParseSuccess
          ? jest.fn().mockReturnValue({ name: 'Harvest', args: { reward: rewardWei } })
          : jest.fn().mockImplementation(() => {
              throw new Error('no match');
            }),
      }));

      mockEthereum.getToken.mockResolvedValue({
        address: CAKE_ADDR,
        symbol: 'CAKE',
        decimals: 18,
        name: 'PancakeSwap Token',
      });

      return { mockWithdraw };
    }

    it('returns txHash, rewardAmount, rewardToken, rewardTokenAddress on success', async () => {
      setupUnstakeMocks();
      const r = await ps.unstakeNft(TOKEN_ID, WALLET);
      expect(r.txHash).toBe(TX_HASH);
      expect(r.rewardAmount).toBeCloseTo(12.345678, 5);
      expect(r.rewardToken).toBe('CAKE');
      expect(r.rewardTokenAddress).toBe(CAKE_ADDR);
    });

    it('calls withdraw with tokenId, walletAddress, and gasLimit 500000', async () => {
      const { mockWithdraw } = setupUnstakeMocks();
      await ps.unstakeNft(TOKEN_ID, WALLET);
      expect(mockWithdraw).toHaveBeenCalledWith(TOKEN_ID, WALLET, { gasLimit: 500000 });
    });

    it('calls masterChef.connect with the wallet signer', async () => {
      setupUnstakeMocks();
      await ps.unstakeNft(TOKEN_ID, WALLET);
      expect(mockEthereum.getWallet).toHaveBeenCalledWith(WALLET);
      expect((ps as any).masterChef.connect).toHaveBeenCalledWith(mockWallet);
    });

    it('returns rewardAmount=0 when no Harvest log is present', async () => {
      setupUnstakeMocks({ includeHarvestLog: false });
      const r = await ps.unstakeNft(TOKEN_ID, WALLET);
      expect(r.rewardAmount).toBe(0);
    });

    it('returns rewardAmount=0 when Harvest log parsing fails', async () => {
      setupUnstakeMocks({ harvestParseSuccess: false });
      const r = await ps.unstakeNft(TOKEN_ID, WALLET);
      expect(r.rewardAmount).toBe(0);
    });

    it('propagates error when withdraw transaction reverts', async () => {
      (ps as any).masterChef = {
        address: MASTERCHEF_ADDR,
        connect: jest.fn().mockReturnValue({
          withdraw: jest.fn().mockRejectedValue(new Error('execution reverted: not owner')),
        }),
      };
      await expect(ps.unstakeNft(TOKEN_ID, WALLET)).rejects.toThrow('execution reverted');
    });

    it('still resolves when CAKE address lookup fails (graceful degradation)', async () => {
      setupUnstakeMocks();
      (ps as any).masterChef.CAKE = jest.fn().mockRejectedValue(new Error('call failed'));
      const r = await ps.unstakeNft(TOKEN_ID, WALLET);
      // MUST NOT throw; rewardToken falls back to 'CAKE'
      expect(r.txHash).toBe(TX_HASH);
      expect(r.rewardToken).toBe('CAKE');
    });

    it('handles very large reward amount (whale position, 1M CAKE)', async () => {
      setupUnstakeMocks({ rewardWei: BigInt('1000000000000000000000000') });
      const r = await ps.unstakeNft(TOKEN_ID, WALLET);
      expect(r.rewardAmount).toBeCloseTo(1000000, 0);
    });

    it('handles exactly zero reward', async () => {
      setupUnstakeMocks({ rewardWei: BigInt(0) });
      const r = await ps.unstakeNft(TOKEN_ID, WALLET);
      expect(r.rewardAmount).toBe(0);
    });

    it('handles fractional CAKE reward (sub-wei boundary)', async () => {
      // 1 wei = 1e-18 CAKE
      setupUnstakeMocks({ rewardWei: BigInt(1) });
      const r = await ps.unstakeNft(TOKEN_ID, WALLET);
      expect(r.rewardAmount).toBeCloseTo(1e-18, 20);
    });
  });
});

import { Solana } from '../../../../src/chains/solana/solana';
import { getPoolInfo as meteoraGetPoolInfo } from '../../../../src/connectors/meteora/clmm-routes/poolInfo';
import { Meteora } from '../../../../src/connectors/meteora/meteora';
import { getPoolInfo as pancakeswapSolGetPoolInfo } from '../../../../src/connectors/pancakeswap-sol/clmm-routes/poolInfo';
import { PancakeswapSol } from '../../../../src/connectors/pancakeswap-sol/pancakeswap-sol';
import { getPoolInfo as raydiumGetPoolInfo } from '../../../../src/connectors/raydium/clmm-routes/poolInfo';
import { Raydium } from '../../../../src/connectors/raydium/raydium';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/pancakeswap-sol/pancakeswap-sol');
jest.mock('../../../../src/connectors/raydium/raydium');
jest.mock('../../../../src/connectors/meteora/meteora');

const mockPoolAddress = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';
const mockNetwork = 'mainnet-beta';

const mockPoolInfo = {
  poolAddress: mockPoolAddress,
  baseTokenAddress: 'So11111111111111111111111111111111111111112',
  quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  baseTokenAmount: 100.5,
  quoteTokenAmount: 20000.0,
  binStep: 25,
  activeBinId: 1500,
  price: 199.0,
};

const mockFastify = {
  httpErrors: {
    badRequest: (msg: string) => new Error(msg),
    notFound: (msg: string) => new Error(msg),
    serviceUnavailable: (msg: string) => new Error(msg),
  },
} as any;

describe('Pool Cache Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PancakeSwap-Sol Pool Cache', () => {
    it('should return cached pool on cache HIT', async () => {
      const mockPoolCache = {
        get: jest.fn().mockReturnValue({ poolInfo: mockPoolInfo }),
        isStale: jest.fn().mockReturnValue(false),
        set: jest.fn(),
      };

      const mockSolana = {
        getPoolCache: jest.fn().mockReturnValue(mockPoolCache),
      };
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      const mockPancakeswap = {
        getClmmPoolInfo: jest.fn(),
      };
      (PancakeswapSol.getInstance as jest.Mock).mockResolvedValue(mockPancakeswap);

      const result = await pancakeswapSolGetPoolInfo(mockFastify, mockNetwork, mockPoolAddress);

      expect(result).toEqual(mockPoolInfo);
      expect(mockPoolCache.get).toHaveBeenCalledWith(mockPoolAddress);
      expect(mockPancakeswap.getClmmPoolInfo).not.toHaveBeenCalled(); // Should not fetch from RPC
    });

    it('should fetch from RPC on cache MISS and populate cache', async () => {
      const mockPoolCache = {
        get: jest.fn().mockReturnValue(null), // Cache miss
        set: jest.fn(),
      };

      const mockSolana = {
        getPoolCache: jest.fn().mockReturnValue(mockPoolCache),
      };
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      const mockPancakeswap = {
        getClmmPoolInfo: jest.fn().mockResolvedValue(mockPoolInfo),
      };
      (PancakeswapSol.getInstance as jest.Mock).mockResolvedValue(mockPancakeswap);

      const result = await pancakeswapSolGetPoolInfo(mockFastify, mockNetwork, mockPoolAddress);

      expect(result).toEqual(mockPoolInfo);
      expect(mockPancakeswap.getClmmPoolInfo).toHaveBeenCalledWith(mockPoolAddress);
      expect(mockPoolCache.set).toHaveBeenCalledWith(mockPoolAddress, { poolInfo: mockPoolInfo });
    });

    it('should trigger background refresh when cache is STALE', async () => {
      const freshPoolInfo = { ...mockPoolInfo, price: 201.0 };

      const mockPoolCache = {
        get: jest.fn().mockReturnValue({ poolInfo: mockPoolInfo }),
        isStale: jest.fn().mockReturnValue(true), // Stale
        set: jest.fn(),
      };

      const mockSolana = {
        getPoolCache: jest.fn().mockReturnValue(mockPoolCache),
      };
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      const mockPancakeswap = {
        getClmmPoolInfo: jest.fn().mockResolvedValue(freshPoolInfo),
      };
      (PancakeswapSol.getInstance as jest.Mock).mockResolvedValue(mockPancakeswap);

      const result = await pancakeswapSolGetPoolInfo(mockFastify, mockNetwork, mockPoolAddress);

      // Should return stale data immediately
      expect(result).toEqual(mockPoolInfo);

      // Background refresh should be triggered (non-blocking)
      // Wait for background promise to resolve
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockPancakeswap.getClmmPoolInfo).toHaveBeenCalledWith(mockPoolAddress);
    });

    it('should use poolAddress as cache key without connector prefix', async () => {
      const mockPoolCache = {
        get: jest.fn().mockReturnValue({ poolInfo: mockPoolInfo }),
        isStale: jest.fn().mockReturnValue(false),
      };

      const mockSolana = {
        getPoolCache: jest.fn().mockReturnValue(mockPoolCache),
      };
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      const mockPancakeswap = {};
      (PancakeswapSol.getInstance as jest.Mock).mockResolvedValue(mockPancakeswap);

      await pancakeswapSolGetPoolInfo(mockFastify, mockNetwork, mockPoolAddress);

      // Verify key is just poolAddress, not "pancakeswap-sol:poolAddress"
      expect(mockPoolCache.get).toHaveBeenCalledWith(mockPoolAddress);
      expect(mockPoolCache.get).not.toHaveBeenCalledWith(`pancakeswap-sol:${mockPoolAddress}`);
    });
  });

  describe('Raydium Pool Cache', () => {
    it('should return cached pool on cache HIT', async () => {
      const mockPoolCache = {
        get: jest.fn().mockReturnValue({ poolInfo: mockPoolInfo }),
        isStale: jest.fn().mockReturnValue(false),
        set: jest.fn(),
      };

      const mockSolana = {
        getPoolCache: jest.fn().mockReturnValue(mockPoolCache),
      };
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      const mockRaydium = {
        getClmmPoolInfo: jest.fn(),
      };
      (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydium);

      const result = await raydiumGetPoolInfo(mockFastify, mockNetwork, mockPoolAddress);

      expect(result).toEqual(mockPoolInfo);
      expect(mockPoolCache.get).toHaveBeenCalledWith(mockPoolAddress);
      expect(mockRaydium.getClmmPoolInfo).not.toHaveBeenCalled();
    });

    it('should fetch from RPC on cache MISS', async () => {
      const mockPoolCache = {
        get: jest.fn().mockReturnValue(null),
        set: jest.fn(),
      };

      const mockSolana = {
        getPoolCache: jest.fn().mockReturnValue(mockPoolCache),
      };
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      const mockRaydium = {
        getClmmPoolInfo: jest.fn().mockResolvedValue(mockPoolInfo),
      };
      (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydium);

      const result = await raydiumGetPoolInfo(mockFastify, mockNetwork, mockPoolAddress);

      expect(result).toEqual(mockPoolInfo);
      expect(mockRaydium.getClmmPoolInfo).toHaveBeenCalledWith(mockPoolAddress);
      expect(mockPoolCache.set).toHaveBeenCalledWith(mockPoolAddress, { poolInfo: mockPoolInfo });
    });
  });

  describe('Meteora Pool Cache', () => {
    it('should return cached pool on cache HIT', async () => {
      const mockPoolCache = {
        get: jest.fn().mockReturnValue({ poolInfo: mockPoolInfo }),
        isStale: jest.fn().mockReturnValue(false),
        set: jest.fn(),
      };

      const mockSolana = {
        getPoolCache: jest.fn().mockReturnValue(mockPoolCache),
      };
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      const mockMeteora = {};
      (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteora);

      const result = await meteoraGetPoolInfo(mockFastify, mockNetwork, mockPoolAddress);

      expect(result).toEqual(mockPoolInfo);
      expect(mockPoolCache.get).toHaveBeenCalledWith(mockPoolAddress);
    });

    it('should fetch from RPC on cache MISS', async () => {
      const mockPoolCache = {
        get: jest.fn().mockReturnValue(null),
        set: jest.fn(),
      };

      const mockSolana = {
        getPoolCache: jest.fn().mockReturnValue(mockPoolCache),
      };
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      const mockMeteora = {
        getPoolInfo: jest.fn().mockResolvedValue(mockPoolInfo),
      };
      (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteora);

      const result = await meteoraGetPoolInfo(mockFastify, mockNetwork, mockPoolAddress);

      expect(result).toEqual(mockPoolInfo);
      expect(mockMeteora.getPoolInfo).toHaveBeenCalledWith(mockPoolAddress);
      expect(mockPoolCache.set).toHaveBeenCalledWith(mockPoolAddress, { poolInfo: mockPoolInfo });
    });
  });
});

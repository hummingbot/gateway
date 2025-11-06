import { Solana } from '../../../../src/chains/solana/solana';
import { getPositionInfo as meteoraGetPositionInfo } from '../../../../src/connectors/meteora/clmm-routes/positionInfo';
import { getPositionsOwned as meteoraGetPositionsOwned } from '../../../../src/connectors/meteora/clmm-routes/positionsOwned';
import { Meteora } from '../../../../src/connectors/meteora/meteora';
import { getPositionInfo as pancakeswapSolGetPositionInfo } from '../../../../src/connectors/pancakeswap-sol/clmm-routes/positionInfo';
import { getPositionsOwned as pancakeswapSolGetPositionsOwned } from '../../../../src/connectors/pancakeswap-sol/clmm-routes/positionsOwned';
import { PancakeswapSol } from '../../../../src/connectors/pancakeswap-sol/pancakeswap-sol';
import { getPositionInfo as raydiumGetPositionInfo } from '../../../../src/connectors/raydium/clmm-routes/positionInfo';
import { getPositionsOwned as raydiumGetPositionsOwned } from '../../../../src/connectors/raydium/clmm-routes/positionsOwned';
import { Raydium } from '../../../../src/connectors/raydium/raydium';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/pancakeswap-sol/pancakeswap-sol');
jest.mock('../../../../src/connectors/raydium/raydium');
jest.mock('../../../../src/connectors/meteora/meteora');

const mockPositionAddress = 'PositionNFT123abc';
const mockWalletAddress = 'WalletAddr123abc';
const mockNetwork = 'mainnet-beta';

const mockPositionInfo = {
  address: mockPositionAddress,
  poolAddress: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
  baseTokenAddress: 'So11111111111111111111111111111111111111112',
  quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  baseTokenAmount: 10.5,
  quoteTokenAmount: 2000.0,
  baseFeeAmount: 0.01,
  quoteFeeAmount: 2.0,
  lowerBinId: 1400,
  upperBinId: 1600,
  lowerPrice: 180.0,
  upperPrice: 220.0,
  price: 200.0,
};

const mockFastify = {
  httpErrors: {
    badRequest: (msg: string) => new Error(msg),
    notFound: (msg: string) => new Error(msg),
    serviceUnavailable: (msg: string) => new Error(msg),
  },
} as any;

describe('Position Cache Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PancakeSwap-Sol Position Cache', () => {
    describe('position-info endpoint', () => {
      it('should return cached position on cache HIT', async () => {
        const cachedPosition = {
          connector: 'pancakeswap-sol',
          positionId: mockPositionAddress,
          poolAddress: mockPositionInfo.poolAddress,
          baseToken: mockPositionInfo.baseTokenAddress,
          quoteToken: mockPositionInfo.quoteTokenAddress,
          liquidity: mockPositionInfo.baseTokenAmount + mockPositionInfo.quoteTokenAmount,
          ...mockPositionInfo,
        };

        const mockPositionCache = {
          get: jest.fn().mockReturnValue({ positions: [cachedPosition] }),
          isStale: jest.fn().mockReturnValue(false),
          set: jest.fn(),
        };

        const mockSolana = {
          getPositionCache: jest.fn().mockReturnValue(mockPositionCache),
        };
        (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

        const mockPancakeswap = {
          getPositionInfo: jest.fn(),
        };
        (PancakeswapSol.getInstance as jest.Mock).mockResolvedValue(mockPancakeswap);

        const result = await pancakeswapSolGetPositionInfo(mockFastify, mockNetwork, mockPositionAddress);

        expect(result).toMatchObject(mockPositionInfo);
        expect(mockPositionCache.get).toHaveBeenCalledWith(`pancakeswap-sol:clmm:${mockPositionAddress}`);
        expect(mockPancakeswap.getPositionInfo).not.toHaveBeenCalled();
      });

      it('should fetch from RPC on cache MISS and populate cache', async () => {
        const mockPositionCache = {
          get: jest.fn().mockReturnValue(null), // Cache miss
          set: jest.fn(),
        };

        const mockSolana = {
          getPositionCache: jest.fn().mockReturnValue(mockPositionCache),
        };
        (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

        const mockPancakeswap = {
          getPositionInfo: jest.fn().mockResolvedValue(mockPositionInfo),
        };
        (PancakeswapSol.getInstance as jest.Mock).mockResolvedValue(mockPancakeswap);

        const result = await pancakeswapSolGetPositionInfo(mockFastify, mockNetwork, mockPositionAddress);

        expect(result).toEqual(mockPositionInfo);
        expect(mockPancakeswap.getPositionInfo).toHaveBeenCalledWith(mockPositionAddress);
        expect(mockPositionCache.set).toHaveBeenCalledWith(
          `pancakeswap-sol:clmm:${mockPositionAddress}`,
          expect.objectContaining({
            positions: expect.arrayContaining([
              expect.objectContaining({
                connector: 'pancakeswap-sol',
                positionId: mockPositionAddress,
                ...mockPositionInfo,
              }),
            ]),
          }),
        );
      });

      it('should use connector:clmm:positionAddress as cache key', async () => {
        const cachedPosition = {
          connector: 'pancakeswap-sol',
          positionId: mockPositionAddress,
          poolAddress: mockPositionInfo.poolAddress,
          baseToken: mockPositionInfo.baseTokenAddress,
          quoteToken: mockPositionInfo.quoteTokenAddress,
          liquidity: 100,
          ...mockPositionInfo,
        };

        const mockPositionCache = {
          get: jest.fn().mockReturnValue({ positions: [cachedPosition] }),
          isStale: jest.fn().mockReturnValue(false),
        };

        const mockSolana = {
          getPositionCache: jest.fn().mockReturnValue(mockPositionCache),
        };
        (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

        const mockPancakeswap = {};
        (PancakeswapSol.getInstance as jest.Mock).mockResolvedValue(mockPancakeswap);

        await pancakeswapSolGetPositionInfo(mockFastify, mockNetwork, mockPositionAddress);

        // Verify key uses connector:clmm:address format
        expect(mockPositionCache.get).toHaveBeenCalledWith(`pancakeswap-sol:clmm:${mockPositionAddress}`);
      });

      it('should trigger background refresh when cache is STALE', async () => {
        const cachedPosition = {
          connector: 'pancakeswap-sol',
          positionId: mockPositionAddress,
          poolAddress: mockPositionInfo.poolAddress,
          baseToken: mockPositionInfo.baseTokenAddress,
          quoteToken: mockPositionInfo.quoteTokenAddress,
          liquidity: 100,
          ...mockPositionInfo,
        };

        const mockPositionCache = {
          get: jest.fn().mockReturnValue({ positions: [cachedPosition] }),
          isStale: jest.fn().mockReturnValue(true), // Stale
          set: jest.fn(),
        };

        const mockSolana = {
          getPositionCache: jest.fn().mockReturnValue(mockPositionCache),
        };
        (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

        const freshPositionInfo = { ...mockPositionInfo, baseTokenAmount: 15.0 };
        const mockPancakeswap = {
          getPositionInfo: jest.fn().mockResolvedValue(freshPositionInfo),
        };
        (PancakeswapSol.getInstance as jest.Mock).mockResolvedValue(mockPancakeswap);

        const result = await pancakeswapSolGetPositionInfo(mockFastify, mockNetwork, mockPositionAddress);

        // Should return stale data immediately
        expect(result).toMatchObject(mockPositionInfo);

        // Background refresh should be triggered (non-blocking)
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockPancakeswap.getPositionInfo).toHaveBeenCalledWith(mockPositionAddress);
      });
    });

    describe('positions-owned endpoint', () => {
      it('should populate position cache for each position found', async () => {
        // Use valid Solana addresses
        const validPosition1 = 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF';
        const validPosition2 = 'DJNtGuBGEQiUCWE8F981M2C3ZghZt2XLD8f2sQdZ6rsZ';
        const validWallet = 'AwGgJaYmhWmkzRb5sLVJwP9dzvLUkKiHQvSxDMUzNt8p';

        const mockPositions = [
          { ...mockPositionInfo, address: validPosition1 },
          { ...mockPositionInfo, address: validPosition2 },
        ];

        const mockPositionCache = {
          set: jest.fn(),
        };

        const mockConnection = {
          getParsedTokenAccountsByOwner: jest
            .fn()
            .mockResolvedValueOnce({
              value: [
                {
                  account: {
                    data: {
                      parsed: {
                        info: {
                          tokenAmount: { decimals: 0, amount: '1', uiAmount: 1 },
                          mint: validPosition1,
                        },
                      },
                    },
                  },
                },
                {
                  account: {
                    data: {
                      parsed: {
                        info: {
                          tokenAmount: { decimals: 0, amount: '1', uiAmount: 1 },
                          mint: validPosition2,
                        },
                      },
                    },
                  },
                },
              ],
            })
            .mockResolvedValueOnce({ value: [] }), // Token2022
        };

        const mockSolana = {
          getPositionCache: jest.fn().mockReturnValue(mockPositionCache),
          connection: mockConnection,
        };
        (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

        const mockPancakeswap = {
          getPositionInfo: jest.fn().mockResolvedValueOnce(mockPositions[0]).mockResolvedValueOnce(mockPositions[1]),
        };
        (PancakeswapSol.getInstance as jest.Mock).mockResolvedValue(mockPancakeswap);

        const result = await pancakeswapSolGetPositionsOwned(mockFastify, mockNetwork, validWallet);

        expect(result).toHaveLength(2);
        // Each position should be cached with connector:clmm:address format
        expect(mockPositionCache.set).toHaveBeenCalledWith(
          `pancakeswap-sol:clmm:${validPosition1}`,
          expect.any(Object),
        );
        expect(mockPositionCache.set).toHaveBeenCalledWith(
          `pancakeswap-sol:clmm:${validPosition2}`,
          expect.any(Object),
        );
        expect(mockPositionCache.set).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Raydium Position Cache', () => {
    it('should return cached position on cache HIT', async () => {
      const cachedPosition = {
        connector: 'raydium',
        positionId: mockPositionAddress,
        poolAddress: mockPositionInfo.poolAddress,
        baseToken: mockPositionInfo.baseTokenAddress,
        quoteToken: mockPositionInfo.quoteTokenAddress,
        liquidity: 100,
        ...mockPositionInfo,
      };

      const mockPositionCache = {
        get: jest.fn().mockReturnValue({ positions: [cachedPosition] }),
        isStale: jest.fn().mockReturnValue(false),
        set: jest.fn(),
      };

      const mockSolana = {
        getPositionCache: jest.fn().mockReturnValue(mockPositionCache),
      };
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      const mockRaydium = {
        getPositionInfo: jest.fn(),
      };
      (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydium);

      const result = await raydiumGetPositionInfo(mockFastify, mockNetwork, mockPositionAddress);

      expect(result).toMatchObject(mockPositionInfo);
      expect(mockPositionCache.get).toHaveBeenCalledWith(`raydium:clmm:${mockPositionAddress}`);
      expect(mockRaydium.getPositionInfo).not.toHaveBeenCalled();
    });

    it('should fetch from RPC on cache MISS', async () => {
      const mockPositionCache = {
        get: jest.fn().mockReturnValue(null),
        set: jest.fn(),
      };

      const mockSolana = {
        getPositionCache: jest.fn().mockReturnValue(mockPositionCache),
      };
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      const mockRaydium = {
        getPositionInfo: jest.fn().mockResolvedValue(mockPositionInfo),
      };
      (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydium);

      const result = await raydiumGetPositionInfo(mockFastify, mockNetwork, mockPositionAddress);

      expect(result).toEqual(mockPositionInfo);
      expect(mockRaydium.getPositionInfo).toHaveBeenCalledWith(mockPositionAddress);
      expect(mockPositionCache.set).toHaveBeenCalled();
    });
  });

  describe('Meteora Position Cache', () => {
    it('should return cached position on cache HIT', async () => {
      const cachedPosition = {
        connector: 'meteora',
        positionId: mockPositionAddress,
        poolAddress: mockPositionInfo.poolAddress,
        baseToken: mockPositionInfo.baseTokenAddress,
        quoteToken: mockPositionInfo.quoteTokenAddress,
        liquidity: 100,
        ...mockPositionInfo,
      };

      const mockPositionCache = {
        get: jest.fn().mockReturnValue({ positions: [cachedPosition] }),
        isStale: jest.fn().mockReturnValue(false),
        set: jest.fn(),
      };

      const mockSolana = {
        getPositionCache: jest.fn().mockReturnValue(mockPositionCache),
      };
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      const mockMeteora = {
        getPositionInfoByAddress: jest.fn(),
      };
      (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteora);

      const result = await meteoraGetPositionInfo(mockFastify, mockNetwork, mockPositionAddress);

      expect(result).toMatchObject(mockPositionInfo);
      expect(mockPositionCache.get).toHaveBeenCalledWith(`meteora:clmm:${mockPositionAddress}`);
      expect(mockMeteora.getPositionInfoByAddress).not.toHaveBeenCalled();
    });

    it('should fetch from RPC on cache MISS', async () => {
      const mockPositionCache = {
        get: jest.fn().mockReturnValue(null),
        set: jest.fn(),
      };

      const mockSolana = {
        getPositionCache: jest.fn().mockReturnValue(mockPositionCache),
      };
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      const mockMeteora = {
        getPositionInfoByAddress: jest.fn().mockResolvedValue(mockPositionInfo),
      };
      (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteora);

      const result = await meteoraGetPositionInfo(mockFastify, mockNetwork, mockPositionAddress);

      expect(result).toEqual(mockPositionInfo);
      expect(mockMeteora.getPositionInfoByAddress).toHaveBeenCalledWith(mockPositionAddress);
      expect(mockPositionCache.set).toHaveBeenCalled();
    });
  });
});

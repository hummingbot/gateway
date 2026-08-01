import { BigNumber } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/uniswap/uniswap');
jest.mock('../../../../src/connectors/uniswap/uniswap.utils');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { poolInfoRoute } = await import('../../../../src/connectors/uniswap/clmm-routes/poolInfo');
  await server.register(poolInfoRoute);
  return server;
};

// Real USDM1/USDC pool: 0x6f161ad0e297ecb9d1b33c048272ccc964cb4b6a
// Real on-chain balances at time of writing: ~167.6K USDM1 and ~182.1K USDC.
// Regression test: previously the route returned pool.liquidity / 10^decimals for both
// tokens (a meaningless quantity), so this test pins the route to ERC20 balanceOf().
const POOL_ADDRESS = '0x6f161ad0e297ecb9d1b33c048272ccc964cb4b6a';
const USDM1 = {
  address: '0x90a1717E0dABE37693f79aFe43AE236dc3b65957',
  symbol: 'USDM1',
  decimals: 18,
};
const USDC = {
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  symbol: 'USDC',
  decimals: 6,
};

// Real ERC20 balances of the pool contract — what balanceOf() should return.
const USDM1_RAW_BALANCE = BigNumber.from('167600000000000000000000'); // 167,600 * 1e18
const USDC_RAW_BALANCE = BigNumber.from('182100000000'); //              182,100 * 1e6

// Bogus value the route used to return for both tokens (V3 virtual liquidity).
const POOL_LIQUIDITY = BigNumber.from('11034936417288527');

describe('GET /pool-info (Uniswap CLMM)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the pool contract's actual ERC20 balances, not pool.liquidity", async () => {
    const { Uniswap } = await import('../../../../src/connectors/uniswap/uniswap');
    const { getUniswapPoolInfo, formatTokenAmount } = await import('../../../../src/connectors/uniswap/uniswap.utils');

    (getUniswapPoolInfo as jest.Mock).mockResolvedValue({
      baseTokenAddress: USDM1.address,
      quoteTokenAddress: USDC.address,
      poolType: 'clmm',
    });

    // Make formatTokenAmount work like the real implementation so we can pin numeric outputs.
    (formatTokenAmount as jest.Mock).mockImplementation(
      (amount: string, decimals: number) => Number(amount) / Math.pow(10, decimals),
    );

    // Mock the V3 pool object. `liquidity` is set to the meaningless virtual-liquidity
    // value to prove the route is NOT using it anymore.
    const mockPool = {
      token0: { address: USDM1.address, decimals: USDM1.decimals },
      token1: { address: USDC.address, decimals: USDC.decimals },
      liquidity: POOL_LIQUIDITY,
      sqrtRatioX96: BigNumber.from('79228162514264337593543950336'),
      token0Price: { toSignificant: () => '1.01146' }, // USDM1 priced in USDC
      token1Price: { toSignificant: () => '0.98867' },
      fee: 100, // 0.01% in Uniswap V3 hundredths-of-bips
      tickSpacing: 1,
      tickCurrent: -276211,
    };

    (Uniswap.getInstance as jest.Mock).mockResolvedValue({
      getToken: jest.fn().mockImplementation((addr: string) => {
        if (addr.toLowerCase() === USDM1.address.toLowerCase()) return USDM1;
        if (addr.toLowerCase() === USDC.address.toLowerCase()) return USDC;
        return null;
      }),
      getV3Pool: jest.fn().mockResolvedValue(mockPool),
    });

    // Mock ERC20 balanceOf calls by mint address.
    const mockUsdm1Contract = { address: USDM1.address };
    const mockUsdcContract = { address: USDC.address };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue({
      provider: { _isProvider: true },
      getContract: jest.fn().mockImplementation((tokenAddress: string) => {
        if (tokenAddress.toLowerCase() === USDM1.address.toLowerCase()) return mockUsdm1Contract;
        if (tokenAddress.toLowerCase() === USDC.address.toLowerCase()) return mockUsdcContract;
        throw new Error(`unexpected contract address ${tokenAddress}`);
      }),
      getERC20BalanceByAddress: jest.fn().mockImplementation((contract: any, address: string, decimals: number) => {
        expect(address).toBe(POOL_ADDRESS); // route must query the pool contract
        if (contract.address === USDM1.address) {
          return Promise.resolve({ value: USDM1_RAW_BALANCE, decimals });
        }
        if (contract.address === USDC.address) {
          return Promise.resolve({ value: USDC_RAW_BALANCE, decimals });
        }
        return Promise.reject(new Error('unexpected token'));
      }),
    });

    const response = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'mainnet', poolAddress: POOL_ADDRESS },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    // Pool metadata still surfaced from the V3 pool object.
    expect(body.address).toBe(POOL_ADDRESS);
    expect(body.baseTokenAddress).toBe(USDM1.address);
    expect(body.quoteTokenAddress).toBe(USDC.address);
    expect(body.feePct).toBeCloseTo(0.01, 6);
    expect(body.binStep).toBe(1);
    expect(body.activeBinId).toBe(-276211);
    expect(body.price).toBeCloseTo(1.01146, 4);

    // The actual fix: token amounts come from ERC20 balanceOf, not pool.liquidity.
    expect(body.baseTokenAmount).toBeCloseTo(167600, 0);
    expect(body.quoteTokenAmount).toBeCloseTo(182100, 0);

    // Regression guard: the legacy bug returned pool.liquidity / 10^decimals.
    // Make sure neither side resembles those values.
    const buggyBase = Number(POOL_LIQUIDITY.toString()) / 1e18;
    const buggyQuote = Number(POOL_LIQUIDITY.toString()) / 1e6;
    expect(body.baseTokenAmount).not.toBeCloseTo(buggyBase, 2);
    expect(body.quoteTokenAmount).not.toBeCloseTo(buggyQuote, 2);
  });

  it('flips base/quote correctly when base is token1', async () => {
    const { Uniswap } = await import('../../../../src/connectors/uniswap/uniswap');
    const { getUniswapPoolInfo, formatTokenAmount } = await import('../../../../src/connectors/uniswap/uniswap.utils');

    // Same pool, but caller treats USDC as the base.
    (getUniswapPoolInfo as jest.Mock).mockResolvedValue({
      baseTokenAddress: USDC.address,
      quoteTokenAddress: USDM1.address,
      poolType: 'clmm',
    });
    (formatTokenAmount as jest.Mock).mockImplementation(
      (amount: string, decimals: number) => Number(amount) / Math.pow(10, decimals),
    );

    const mockPool = {
      token0: { address: USDM1.address, decimals: USDM1.decimals },
      token1: { address: USDC.address, decimals: USDC.decimals },
      liquidity: POOL_LIQUIDITY,
      sqrtRatioX96: BigNumber.from('79228162514264337593543950336'),
      token0Price: { toSignificant: () => '1.01146' },
      token1Price: { toSignificant: () => '0.98867' },
      fee: 100,
      tickSpacing: 1,
      tickCurrent: -276211,
    };

    (Uniswap.getInstance as jest.Mock).mockResolvedValue({
      getToken: jest.fn().mockImplementation((addr: string) => {
        if (addr.toLowerCase() === USDM1.address.toLowerCase()) return USDM1;
        if (addr.toLowerCase() === USDC.address.toLowerCase()) return USDC;
        return null;
      }),
      getV3Pool: jest.fn().mockResolvedValue(mockPool),
    });

    (Ethereum.getInstance as jest.Mock).mockResolvedValue({
      provider: { _isProvider: true },
      getContract: jest.fn().mockImplementation((tokenAddress: string) => ({ address: tokenAddress })),
      getERC20BalanceByAddress: jest.fn().mockImplementation((contract: any, _address: string, decimals: number) => {
        if (contract.address === USDM1.address) {
          return Promise.resolve({ value: USDM1_RAW_BALANCE, decimals });
        }
        return Promise.resolve({ value: USDC_RAW_BALANCE, decimals });
      }),
    });

    const response = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'mainnet', poolAddress: POOL_ADDRESS },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    // Base is USDC now → base amount should be the USDC balance.
    expect(body.baseTokenAmount).toBeCloseTo(182100, 0);
    expect(body.quoteTokenAmount).toBeCloseTo(167600, 0);
    // Price flips correspondingly (USDC per USDM1 was 1.01146; USDM1 per USDC ≈ 0.98867).
    expect(body.price).toBeCloseTo(0.98867, 4);
  });

  describe('binCount param', () => {
    const sampleBins = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        binId: -276211 + i,
        price: 1.01 + i * 0.0001,
        baseTokenAmount: i < Math.floor(n / 2) ? 0 : 1,
        quoteTokenAmount: i < Math.floor(n / 2) ? 100 : 0,
      }));

    // Shared mock setup so each binCount test exercises the route end-to-end.
    const setupMocks = async () => {
      const { Uniswap } = await import('../../../../src/connectors/uniswap/uniswap');
      const { getUniswapPoolInfo, formatTokenAmount } = await import(
        '../../../../src/connectors/uniswap/uniswap.utils'
      );
      (getUniswapPoolInfo as jest.Mock).mockResolvedValue({
        baseTokenAddress: USDM1.address,
        quoteTokenAddress: USDC.address,
        poolType: 'clmm',
      });
      (formatTokenAmount as jest.Mock).mockImplementation(
        (amount: string, decimals: number) => Number(amount) / Math.pow(10, decimals),
      );
      const mockPool = {
        token0: { address: USDM1.address, decimals: USDM1.decimals },
        token1: { address: USDC.address, decimals: USDC.decimals },
        liquidity: POOL_LIQUIDITY,
        sqrtRatioX96: BigNumber.from('79228162514264337593543950336'),
        token0Price: { toSignificant: () => '1.01146' },
        token1Price: { toSignificant: () => '0.98867' },
        fee: 100,
        tickSpacing: 1,
        tickCurrent: -276211,
      };
      (Uniswap.getInstance as jest.Mock).mockResolvedValue({
        getToken: jest.fn().mockImplementation((addr: string) => {
          if (addr.toLowerCase() === USDM1.address.toLowerCase()) return USDM1;
          if (addr.toLowerCase() === USDC.address.toLowerCase()) return USDC;
          return null;
        }),
        getV3Pool: jest.fn().mockResolvedValue(mockPool),
      });
      (Ethereum.getInstance as jest.Mock).mockResolvedValue({
        // _isProvider keeps ethers' Contract constructor happy in the binCount branch
        provider: { _isProvider: true },
        getContract: jest.fn().mockImplementation((tokenAddress: string) => ({ address: tokenAddress })),
        getERC20BalanceByAddress: jest.fn().mockImplementation((contract: any, _address: string, decimals: number) => {
          if (contract.address === USDM1.address) return Promise.resolve({ value: USDM1_RAW_BALANCE, decimals });
          return Promise.resolve({ value: USDC_RAW_BALANCE, decimals });
        }),
      });
    };

    it('omits bins[] when binCount is not provided', async () => {
      await setupMocks();
      const { computeUniswapBinDistribution } = await import('../../../../src/connectors/uniswap/uniswap.utils');
      const response = await server.inject({
        method: 'GET',
        url: '/pool-info',
        query: { network: 'mainnet', poolAddress: POOL_ADDRESS },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).bins).toBeUndefined();
      expect(computeUniswapBinDistribution).not.toHaveBeenCalled();
    });

    it('omits bins[] when binCount=0', async () => {
      await setupMocks();
      const { computeUniswapBinDistribution } = await import('../../../../src/connectors/uniswap/uniswap.utils');
      const response = await server.inject({
        method: 'GET',
        url: '/pool-info',
        query: { network: 'mainnet', poolAddress: POOL_ADDRESS, binCount: 0 },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).bins).toBeUndefined();
      expect(computeUniswapBinDistribution).not.toHaveBeenCalled();
    });

    it('returns bins[] of length N when binCount=N', async () => {
      await setupMocks();
      const { computeUniswapBinDistribution } = await import('../../../../src/connectors/uniswap/uniswap.utils');
      (computeUniswapBinDistribution as jest.Mock).mockResolvedValueOnce(sampleBins(11));
      const response = await server.inject({
        method: 'GET',
        url: '/pool-info',
        query: { network: 'mainnet', poolAddress: POOL_ADDRESS, binCount: 11 },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.bins)).toBe(true);
      expect(body.bins).toHaveLength(11);
      expect(body.bins[0]).toEqual(
        expect.objectContaining({
          binId: expect.any(Number),
          price: expect.any(Number),
          baseTokenAmount: expect.any(Number),
          quoteTokenAmount: expect.any(Number),
        }),
      );
      expect(computeUniswapBinDistribution).toHaveBeenCalledTimes(1);
      const call = (computeUniswapBinDistribution as jest.Mock).mock.calls[0][0];
      expect(call.binCount).toBe(11);
      expect(call.tickSpacing).toBe(1);
      expect(call.currentTick).toBe(-276211);
    });

    it('rejects binCount above the schema max', async () => {
      await setupMocks();
      const response = await server.inject({
        method: 'GET',
        url: '/pool-info',
        query: { network: 'mainnet', poolAddress: POOL_ADDRESS, binCount: 999 },
      });
      expect(response.statusCode).toBe(400);
    });
  });
});

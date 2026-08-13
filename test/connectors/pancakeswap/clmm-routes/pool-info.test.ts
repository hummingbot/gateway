import { BigNumber } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/pancakeswap/pancakeswap');
jest.mock('../../../../src/connectors/pancakeswap/pancakeswap.utils');
jest.mock('../../../../src/connectors/clmm-v3-utils');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { poolInfoRoute } = await import('../../../../src/connectors/pancakeswap/clmm-routes/poolInfo');
  await server.register(poolInfoRoute);
  return server;
};

// PancakeSwap V3 USDT-WBNB pool on BSC.
const POOL_ADDRESS = '0x172fcd41e0913e95784454622d1c3724f546f849';
const USDT = { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18 };
const WBNB = { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB', decimals: 18 };

const USDT_RAW_BALANCE = BigNumber.from('4200000000000000000000000'); // 4,200,000 * 1e18
const WBNB_RAW_BALANCE = BigNumber.from('7000000000000000000000'); //       7,000 * 1e18

// V3 virtual liquidity — the value the route used to report for BOTH tokens.
const POOL_LIQUIDITY = BigNumber.from('11034936417288527');

const mockPool = {
  token0: { address: USDT.address, decimals: USDT.decimals },
  token1: { address: WBNB.address, decimals: WBNB.decimals },
  liquidity: POOL_LIQUIDITY,
  sqrtRatioX96: BigNumber.from('79228162514264337593543950336'),
  token0Price: { toSignificant: () => '0.00166' }, // USDT priced in WBNB
  token1Price: { toSignificant: () => '602.4' },
  fee: 2500, // 0.25% in hundredths-of-bips
  tickSpacing: 50,
  tickCurrent: -64000,
};

const setupMocks = async () => {
  const { Pancakeswap } = await import('../../../../src/connectors/pancakeswap/pancakeswap');
  const { getPancakeswapPoolInfo, formatTokenAmount } = await import(
    '../../../../src/connectors/pancakeswap/pancakeswap.utils'
  );

  (getPancakeswapPoolInfo as jest.Mock).mockResolvedValue({
    baseTokenAddress: USDT.address,
    quoteTokenAddress: WBNB.address,
    poolType: 'clmm',
  });
  (formatTokenAmount as jest.Mock).mockImplementation(
    (amount: string, decimals: number) => Number(amount) / Math.pow(10, decimals),
  );

  (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
    getToken: jest.fn().mockImplementation((addr: string) => {
      if (addr.toLowerCase() === USDT.address.toLowerCase()) return USDT;
      if (addr.toLowerCase() === WBNB.address.toLowerCase()) return WBNB;
      return null;
    }),
    getV3Pool: jest.fn().mockResolvedValue(mockPool),
  });

  const mockUsdtContract = { address: USDT.address };
  const mockWbnbContract = { address: WBNB.address };
  (Ethereum.getInstance as jest.Mock).mockResolvedValue({
    provider: { _isProvider: true },
    getContract: jest.fn().mockImplementation((tokenAddress: string) => {
      if (tokenAddress.toLowerCase() === USDT.address.toLowerCase()) return mockUsdtContract;
      if (tokenAddress.toLowerCase() === WBNB.address.toLowerCase()) return mockWbnbContract;
      throw new Error(`unexpected contract address ${tokenAddress}`);
    }),
    getERC20BalanceByAddress: jest.fn().mockImplementation((contract: any, address: string, decimals: number) => {
      expect(address).toBe(POOL_ADDRESS); // route must query the pool contract
      if (contract.address === USDT.address) return Promise.resolve({ value: USDT_RAW_BALANCE, decimals });
      if (contract.address === WBNB.address) return Promise.resolve({ value: WBNB_RAW_BALANCE, decimals });
      return Promise.reject(new Error('unexpected token'));
    }),
  });
};

const sampleBins = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    binId: -64000 + i * 50,
    price: 600 + i,
    baseTokenAmount: 10 + i,
    quoteTokenAmount: 20 + i,
  }));

describe('GET /pool-info (PancakeSwap CLMM)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await setupMocks();
  });

  it("returns the pool contract's actual ERC20 balances, not pool.liquidity", async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'bsc', poolAddress: POOL_ADDRESS },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.address).toBe(POOL_ADDRESS);
    expect(body.feePct).toBeCloseTo(0.25, 6);
    expect(body.binStep).toBe(50);
    expect(body.activeBinId).toBe(-64000);

    // The fix: token amounts come from ERC20 balanceOf, not virtual liquidity.
    expect(body.baseTokenAmount).toBeCloseTo(4200000, 0);
    expect(body.quoteTokenAmount).toBeCloseTo(7000, 0);

    // Regression guard: the legacy bug reported pool.liquidity / 10^decimals for
    // both sides — identical figures that mean nothing in token terms.
    const buggy = Number(POOL_LIQUIDITY.toString()) / 1e18;
    expect(body.baseTokenAmount).not.toBeCloseTo(buggy, 6);
    expect(body.quoteTokenAmount).not.toBeCloseTo(buggy, 6);
    expect(body.baseTokenAmount).not.toEqual(body.quoteTokenAmount);
  });

  it('omits bins and skips the tick reads when binCount is absent', async () => {
    const { computeV3BinDistribution } = await import('../../../../src/connectors/clmm-v3-utils');

    const response = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'bsc', poolAddress: POOL_ADDRESS },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).bins).toBeUndefined();
    expect(computeV3BinDistribution).not.toHaveBeenCalled();
  });

  it('returns bins when binCount > 0', async () => {
    const { computeV3BinDistribution } = await import('../../../../src/connectors/clmm-v3-utils');
    (computeV3BinDistribution as jest.Mock).mockResolvedValueOnce(sampleBins(11));

    const response = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'bsc', poolAddress: POOL_ADDRESS, binCount: '11' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.bins).toHaveLength(11);
    expect(body.bins[0]).toEqual({ binId: -64000, price: 600, baseTokenAmount: 10, quoteTokenAmount: 20 });

    expect(computeV3BinDistribution).toHaveBeenCalledTimes(1);
    const args = (computeV3BinDistribution as jest.Mock).mock.calls[0][0];
    expect(args.binCount).toBe(11);
    expect(args.tickSpacing).toBe(50);
    expect(args.currentTick).toBe(-64000);
    expect(args.isBaseToken0).toBe(true);
    // PancakeSwap's SDK math must be supplied — the shared helper is math-agnostic.
    expect(typeof args.tickMath.getSqrtRatioAtTick).toBe('function');
    expect(typeof args.sqrtPriceMath.getAmount0Delta).toBe('function');
  });
});

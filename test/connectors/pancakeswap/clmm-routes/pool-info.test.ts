import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { Pancakeswap } from '../../../../src/connectors/pancakeswap/pancakeswap';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/pancakeswap/pancakeswap');
jest.mock('../../../../src/connectors/pancakeswap/pancakeswap.utils');
jest.mock('../../../../src/connectors/uniswap/uniswap.utils');

const POOL_ADDRESS = '0x172fcd41e0913e95784454622d1c3724f546f849';

const BASE_TOKEN = { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18 };
const QUOTE_TOKEN = { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB', decimals: 18 };

const MOCK_POOL = {
  token0: { address: BASE_TOKEN.address, decimals: BASE_TOKEN.decimals },
  token1: { address: QUOTE_TOKEN.address, decimals: QUOTE_TOKEN.decimals },
  liquidity: { toString: () => '1000000000000000000' },
  sqrtRatioX96: { toString: () => '79228162514264337593543950336' },
  token0Price: { toSignificant: () => '200.0' },
  token1Price: { toSignificant: () => '0.005' },
  fee: 500,
  tickSpacing: 10,
  tickCurrent: -276225,
};

const MOCK_POOL_INFO = {
  address: POOL_ADDRESS,
  baseTokenAddress: BASE_TOKEN.address,
  quoteTokenAddress: QUOTE_TOKEN.address,
  poolType: 'clmm',
};

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { poolInfoRoute } = await import('../../../../src/connectors/pancakeswap/clmm-routes/poolInfo');
  await server.register(poolInfoRoute);
  return server;
};

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

    const { getPancakeswapPoolInfo, formatTokenAmount } = await import(
      '../../../../src/connectors/pancakeswap/pancakeswap.utils'
    );

    (getPancakeswapPoolInfo as jest.Mock).mockResolvedValue(MOCK_POOL_INFO);
    (formatTokenAmount as jest.Mock).mockImplementation(
      (amount: string, decimals: number) => Number(amount) / Math.pow(10, decimals),
    );

    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      getToken: jest.fn().mockImplementation((addr: string) => {
        if (addr.toLowerCase() === BASE_TOKEN.address.toLowerCase()) return BASE_TOKEN;
        if (addr.toLowerCase() === QUOTE_TOKEN.address.toLowerCase()) return QUOTE_TOKEN;
        return null;
      }),
      getV3Pool: jest.fn().mockResolvedValue(MOCK_POOL),
    });

    (Ethereum.getInstance as jest.Mock).mockResolvedValue({ provider: {} });
  });

  it('returns pool info without bins when binCount is not provided', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'bsc', poolAddress: POOL_ADDRESS },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.address).toBe(POOL_ADDRESS);
    expect(body.bins).toBeUndefined();
  });

  it('returns pool info without bins when binCount=0', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'bsc', poolAddress: POOL_ADDRESS, binCount: '0' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.bins).toBeUndefined();
  });

  it('returns bins array when binCount=10', async () => {
    const { computeUniswapBinDistribution } = await import('../../../../src/connectors/uniswap/uniswap.utils');

    const mockBins = Array.from({ length: 10 }, (_, i) => ({
      binId: MOCK_POOL.tickCurrent - 50 + i * 10,
      price: 200 + i * 0.1,
      baseTokenAmount: 100,
      quoteTokenAmount: 0.5,
    }));
    (computeUniswapBinDistribution as jest.Mock).mockResolvedValue(mockBins);

    const res = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'bsc', poolAddress: POOL_ADDRESS, binCount: '10' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.bins)).toBe(true);
    expect(body.bins).toHaveLength(10);
    expect(computeUniswapBinDistribution).toHaveBeenCalledWith(
      expect.objectContaining({ binCount: 10, poolAddress: POOL_ADDRESS }),
    );
  });

  it('returns 400 when binCount exceeds maximum (401)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'bsc', poolAddress: POOL_ADDRESS, binCount: '402' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when pool is not found', async () => {
    const { getPancakeswapPoolInfo } = await import('../../../../src/connectors/pancakeswap/pancakeswap.utils');
    (getPancakeswapPoolInfo as jest.Mock).mockResolvedValue(null);

    const res = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'bsc', poolAddress: POOL_ADDRESS },
    });

    expect(res.statusCode).toBe(404);
  });
});

import { Raydium } from '../../../../src/connectors/raydium/raydium';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/connectors/raydium/raydium');
jest.mock('../../../../src/chains/solana/solana');

// Stub the bin helper so the test doesn't hit the SDK's tick-array fetcher.
jest.mock('../../../../src/connectors/raydium/raydium.utils', () => {
  const actual = jest.requireActual('../../../../src/connectors/raydium/raydium.utils');
  return {
    ...actual,
    computeRaydiumBinDistribution: jest.fn(),
  };
});

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { poolInfoRoute } = await import('../../../../src/connectors/raydium/clmm-routes/poolInfo');
  await server.register(poolInfoRoute);
  return server;
};

const mockPoolAddress = '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv';

const mockPoolInfo = {
  address: mockPoolAddress,
  baseTokenAddress: 'So11111111111111111111111111111111111111112',
  quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  binStep: 4,
  feePct: 0.0001,
  price: 200.5,
  baseTokenAmount: 1000,
  quoteTokenAmount: 200500,
  activeBinId: -28800,
};

describe('GET /pool-info (raydium clmm)', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const mockRaydium = {
      getClmmPoolInfo: jest.fn().mockResolvedValue(mockPoolInfo),
      // Used by the binCount path to grab tickCurrent + sqrtPriceX64 + L
      getClmmPoolfromRPC: jest.fn().mockResolvedValue({
        tickSpacing: 4,
        tickCurrent: -28800,
        sqrtPriceX64: { toString: () => '123456789' },
        liquidity: { toString: () => '1000000000' },
      }),
      // Used to look up the SDK-style poolInfo + poolKeys
      getClmmPoolfromAPI: jest.fn().mockResolvedValue([
        {
          id: mockPoolAddress,
          programId: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
          mintA: { address: mockPoolInfo.baseTokenAddress, decimals: 9 },
          mintB: { address: mockPoolInfo.quoteTokenAddress, decimals: 6 },
        },
        {},
      ]),
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydium);
    // Used by the binCount path for `solana.connection`
    const { Solana } = require('../../../../src/chains/solana/solana');
    (Solana.getInstance as jest.Mock).mockResolvedValue({ connection: {} });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the base pool info shape', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'mainnet-beta', poolAddress: mockPoolAddress },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual(
      expect.objectContaining({
        address: mockPoolAddress,
        baseTokenAddress: mockPoolInfo.baseTokenAddress,
        quoteTokenAddress: mockPoolInfo.quoteTokenAddress,
        feePct: expect.any(Number),
        price: expect.any(Number),
        activeBinId: expect.any(Number),
      }),
    );
  });

  it('returns 404 when pool not found', async () => {
    (Raydium.getInstance as jest.Mock).mockResolvedValue({
      getClmmPoolInfo: jest.fn().mockResolvedValue(null),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'mainnet-beta', poolAddress: mockPoolAddress },
    });
    expect(response.statusCode).toBe(404);
  });

  describe('binCount param', () => {
    const sampleBins = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        binId: -28800 + i,
        price: 200 + i,
        baseTokenAmount: i < Math.floor(n / 2) ? 0 : 1,
        quoteTokenAmount: i < Math.floor(n / 2) ? 100 : 0,
      }));

    it('omits bins[] when binCount is not provided', async () => {
      const { computeRaydiumBinDistribution } = await import('../../../../src/connectors/raydium/raydium.utils');
      const response = await app.inject({
        method: 'GET',
        url: '/pool-info',
        query: { network: 'mainnet-beta', poolAddress: mockPoolAddress },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).bins).toBeUndefined();
      expect(computeRaydiumBinDistribution).not.toHaveBeenCalled();
    });

    it('omits bins[] when binCount=0', async () => {
      const { computeRaydiumBinDistribution } = await import('../../../../src/connectors/raydium/raydium.utils');
      const response = await app.inject({
        method: 'GET',
        url: '/pool-info',
        query: { network: 'mainnet-beta', poolAddress: mockPoolAddress, binCount: 0 },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).bins).toBeUndefined();
      expect(computeRaydiumBinDistribution).not.toHaveBeenCalled();
    });

    it('returns bins[] of length N when binCount=N', async () => {
      const { computeRaydiumBinDistribution } = await import('../../../../src/connectors/raydium/raydium.utils');
      (computeRaydiumBinDistribution as jest.Mock).mockResolvedValueOnce(sampleBins(11));
      const response = await app.inject({
        method: 'GET',
        url: '/pool-info',
        query: { network: 'mainnet-beta', poolAddress: mockPoolAddress, binCount: 11 },
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
      expect(computeRaydiumBinDistribution).toHaveBeenCalledTimes(1);
      const call = (computeRaydiumBinDistribution as jest.Mock).mock.calls[0][0];
      expect(call.binCount).toBe(11);
      expect(call.tickSpacing).toBe(4);
      expect(call.currentTick).toBe(-28800);
    });

    it('rejects binCount above the schema max', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/pool-info',
        query: { network: 'mainnet-beta', poolAddress: mockPoolAddress, binCount: 999 },
      });
      expect(response.statusCode).toBe(400);
    });
  });
});

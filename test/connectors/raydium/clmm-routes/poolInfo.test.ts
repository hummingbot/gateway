import { Solana } from '../../../../src/chains/solana/solana';
import { Raydium } from '../../../../src/connectors/raydium/raydium';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/raydium/raydium');
jest.mock('../../../../src/connectors/raydium/raydium.utils', () => ({
  computeRaydiumBinDistribution: jest.fn(),
}));

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { poolInfoRoute } = await import('../../../../src/connectors/raydium/clmm-routes/poolInfo');
  await server.register(poolInfoRoute);
  return server;
};

const POOL_ADDRESS = '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv';
const BASE_TOKEN_ADDR = 'So11111111111111111111111111111111111111112'; // SOL
const QUOTE_TOKEN_ADDR = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC

const MOCK_POOL_INFO = {
  address: POOL_ADDRESS,
  baseTokenAddress: BASE_TOKEN_ADDR,
  quoteTokenAddress: QUOTE_TOKEN_ADDR,
  binStep: 60,
  feePct: 0.25,
  price: 200.5,
  baseTokenAmount: 500,
  quoteTokenAmount: 100250,
  activeBinId: -12345,
};

describe('GET /pool-info (Raydium CLMM)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    (Raydium.getInstance as jest.Mock).mockResolvedValue({
      getClmmPoolInfo: jest.fn().mockResolvedValue(MOCK_POOL_INFO),
      getClmmPoolfromAPI: jest.fn().mockResolvedValue(null),
      getClmmPoolfromRPC: jest.fn().mockResolvedValue(null),
    });

    (Solana.getInstance as jest.Mock).mockResolvedValue({
      connection: {},
    });
  });

  // ── Happy paths ────────────────────────────────────────────────────────────

  it('returns pool info with all standard fields', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'mainnet-beta', poolAddress: POOL_ADDRESS },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.address).toBe(POOL_ADDRESS);
    expect(body.baseTokenAddress).toBe(BASE_TOKEN_ADDR);
    expect(body.quoteTokenAddress).toBe(QUOTE_TOKEN_ADDR);
    expect(body.feePct).toBe(0.25);
    expect(body.price).toBe(200.5);
    expect(body.baseTokenAmount).toBe(500);
    expect(body.quoteTokenAmount).toBe(100250);
    expect(body.activeBinId).toBe(-12345);
  });

  // ── binCount parameter ─────────────────────────────────────────────────────

  it('returns pool info without bins when binCount is not provided', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'mainnet-beta', poolAddress: POOL_ADDRESS },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.bins).toBeUndefined();
  });

  it('returns pool info without bins when binCount=0', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'mainnet-beta', poolAddress: POOL_ADDRESS, binCount: '0' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.bins).toBeUndefined();
  });

  it('returns bins array of correct shape when binCount=8', async () => {
    const mockBins = Array.from({ length: 8 }, (_, i) => ({
      binId: -12345 + (i - 4) * 60,
      price: 200 + i * 0.5,
      baseTokenAmount: 100,
      quoteTokenAmount: 20000,
    }));

    const { computeRaydiumBinDistribution } = require('../../../../src/connectors/raydium/raydium.utils');
    (computeRaydiumBinDistribution as jest.Mock).mockResolvedValue(mockBins);

    // Provide the API/RPC data computeRaydiumBinDistribution needs
    (Raydium.getInstance as jest.Mock).mockResolvedValue({
      getClmmPoolInfo: jest.fn().mockResolvedValue(MOCK_POOL_INFO),
      getClmmPoolfromAPI: jest.fn().mockResolvedValue([{}, {}]),
      getClmmPoolfromRPC: jest.fn().mockResolvedValue({
        tickSpacing: 60,
        tickCurrent: -12345,
        sqrtPriceX64: { toString: () => '123456789' },
        liquidity: { toString: () => '1000000000' },
        mintDecimalsA: 9,
        mintDecimalsB: 6,
      }),
    });

    const response = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'mainnet-beta', poolAddress: POOL_ADDRESS, binCount: '8' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body.bins)).toBe(true);
    expect(body.bins).toHaveLength(8);
    expect(body.bins[0]).toMatchObject({
      binId: expect.any(Number),
      price: expect.any(Number),
      baseTokenAmount: expect.any(Number),
      quoteTokenAmount: expect.any(Number),
    });
  });

  it('returns 400 when binCount exceeds maximum (401)', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'mainnet-beta', poolAddress: POOL_ADDRESS, binCount: '402' },
    });

    expect(response.statusCode).toBe(400);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('returns 404 when pool is not found', async () => {
    (Raydium.getInstance as jest.Mock).mockResolvedValue({
      getClmmPoolInfo: jest.fn().mockResolvedValue(null),
    });

    const response = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'mainnet-beta', poolAddress: 'unknown-pool-address' },
    });

    expect(response.statusCode).toBe(404);
  });

  // ── Missing/invalid parameters ─────────────────────────────────────────────

  it('returns 400 when poolAddress is missing', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { network: 'mainnet-beta' },
    });

    expect(response.statusCode).toBe(400);
  });
});

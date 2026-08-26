import { MeteoraDamm } from '../../../../src/connectors/meteora/meteora-damm';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';
import { parseWire } from '../../../utils/wire';

jest.mock('../../../../src/connectors/meteora/meteora-damm');

const mockPoolAddress = 'FH6mP2MUobhDnLERp9z5yv5t2zMUA9WDNXPixpbvYKMv';
const mockSOL = 'So11111111111111111111111111111111111111112';
const mockUSDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { poolInfoRoute } = await import('../../../../src/trading/trading-amm-routes/pool-info');
  await server.register(poolInfoRoute);
  return server;
};

describe('GET /pool-info (Meteora DAMM v2)', () => {
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

  it('returns AMM pool information', async () => {
    (MeteoraDamm.getInstance as jest.Mock).mockResolvedValue({
      getPoolInfo: jest.fn().mockResolvedValue({
        address: mockPoolAddress,
        baseTokenAddress: mockSOL,
        quoteTokenAddress: mockUSDC,
        feePct: 0.25,
        price: 150,
        baseTokenAmount: 1000,
        quoteTokenAmount: 150000,
      }),
    });

    const response = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { chainNetwork: 'solana-mainnet-beta', connector: 'meteora', poolAddress: mockPoolAddress },
    });

    expect(response.statusCode).toBe(200);
    const body = parseWire(response.body);
    expect(body).toEqual({
      address: mockPoolAddress,
      baseTokenAddress: mockSOL,
      quoteTokenAddress: mockUSDC,
      feePct: 0.25,
      price: 150,
      baseTokenAmount: 1000,
      quoteTokenAmount: 150000,
    });
  });

  it('propagates a 404 when the pool is not a DAMM v2 pool', async () => {
    (MeteoraDamm.getInstance as jest.Mock).mockResolvedValue({
      getPoolInfo: jest.fn().mockRejectedValue({ statusCode: 404, message: 'Pool not found' }),
    });

    const response = await server.inject({
      method: 'GET',
      url: '/pool-info',
      query: { chainNetwork: 'solana-mainnet-beta', connector: 'meteora', poolAddress: mockPoolAddress },
    });

    expect(response.statusCode).toBe(404);
  });
});

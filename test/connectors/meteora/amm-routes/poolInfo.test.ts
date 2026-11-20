import { MeteoraDamm } from '../../../../src/connectors/meteora/meteora-damm';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/connectors/meteora/meteora-damm');

const mockPoolAddress = 'FH6mP2MUobhDnLERp9z5yv5t2zMUA9WDNXPixpbvYKMv';

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

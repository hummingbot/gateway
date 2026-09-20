import { MeteoraDamm } from '../../../../src/connectors/meteora/meteora-damm';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/connectors/meteora/meteora-damm');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { createPoolRoute } = await import('../../../../src/trading/trading-amm-routes/create-pool');
  await server.register(createPoolRoute);
  return server;
};

describe('POST /create-pool (Meteora DAMM v2)', () => {
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

  it('requires an explicit configAddress (no unsafe auto-selection)', async () => {
    (MeteoraDamm.getInstance as jest.Mock).mockResolvedValue({});

    const response = await server.inject({
      method: 'POST',
      url: '/create-pool',
      payload: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
        walletAddress: '82Sg8kkChhY7Qb2ptR4uLGqLg7Zm3z9v9tQ6Zb6Jk4iZ',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        baseTokenAmount: 0.1,
        quoteTokenAmount: 15,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/configAddress is required/);
  });
});

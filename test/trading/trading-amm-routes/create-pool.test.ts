import { fastifyWithTypeProvider } from '../../utils/testUtils';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { createPoolRoute } = await import('../../../src/trading/trading-amm-routes/create-pool');
  await server.register(createPoolRoute);
  return server;
};

describe('POST /trading/amm/create-pool (unified dispatch)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  it('rejects an unsupported AMM connector', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/create-pool',
      payload: {
        connector: 'notaconnector',
        chainNetwork: 'solana-mainnet-beta',
        walletAddress: '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        baseTokenAmount: 1,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/must be equal to one of the allowed values/);
  });
});

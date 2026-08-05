import { fastifyWithTypeProvider } from '../../utils/testUtils';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { removeLiquidityRoute } = await import('../../../src/trading/trading-amm-routes/remove-liquidity');
  await server.register(removeLiquidityRoute);
  return server;
};

describe('POST /trading/amm/remove-liquidity (unified dispatch)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  it('requires positionAddress for meteora (DAMM v2 positions are NFTs)', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/remove-liquidity',
      payload: {
        connector: 'meteora',
        chainNetwork: 'solana-mainnet-beta',
        walletAddress: '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5',
        poolAddress: 'FAKEpoolAddress1111111111111111111111111111',
        percentageToRemove: 100,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/positionAddress is required for meteora/);
  });

  it('rejects an unsupported AMM connector', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/remove-liquidity',
      payload: {
        connector: 'notaconnector',
        chainNetwork: 'solana-mainnet-beta',
        walletAddress: '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5',
        poolAddress: 'FAKEpoolAddress1111111111111111111111111111',
        percentageToRemove: 100,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/Unsupported AMM connector/);
  });
});

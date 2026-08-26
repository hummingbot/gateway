import { fastifyWithTypeProvider } from '../../utils/testUtils';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { positionsOwnedRoute } = await import('../../../src/trading/trading-amm-routes/positions-owned');
  await server.register(positionsOwnedRoute);
  return server;
};

const WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';

describe('GET /trading/amm/positions-owned (unified dispatch)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  // Each connector is asked for on the chain it actually runs on. Naming a Solana
  // chain-network for an Ethereum connector is now rejected as a mismatched pair, which
  // is a different rejection than the one these cases are about.
  it.each([
    ['raydium', 'solana-mainnet-beta'],
    ['uniswap', 'ethereum-mainnet'],
    ['pancakeswap', 'ethereum-mainnet'],
  ])('rejects %s: fungible-LP AMMs have no enumerable positions', async (connector, chainNetwork) => {
    const response = await server.inject({
      method: 'GET',
      url: `/positions-owned?connector=${connector}&chainNetwork=${chainNetwork}&walletAddress=${WALLET}`,
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/not supported for .*fungible-LP/);
  });

  it('rejects an unsupported AMM connector', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/positions-owned?connector=notaconnector&chainNetwork=solana-mainnet-beta&walletAddress=${WALLET}`,
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/must be equal to one of the allowed values/);
  });
});

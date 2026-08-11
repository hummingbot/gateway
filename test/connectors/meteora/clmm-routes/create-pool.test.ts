import { Solana } from '../../../../src/chains/solana/solana';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/chains/solana/solana.config', () => ({
  getSolanaChainConfig: jest.fn().mockReturnValue({
    defaultNetwork: 'mainnet-beta',
    defaultWallet: '11111111111111111111111111111111',
  }),
}));

const SAME_MINT = 'So11111111111111111111111111111111111111112';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { createPoolRoute } = await import('../../../../src/connectors/meteora/clmm-routes/createPool');
  await server.register(createPoolRoute);
  return server;
};

describe('POST /create-pool (Meteora DLMM)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Resolve both baseToken and quoteToken to the SAME mint so the pool would be degenerate.
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      network: 'mainnet-beta',
      connection: {},
      getToken: jest.fn().mockResolvedValue({ address: SAME_MINT, decimals: 9 }),
    });
  });

  it('returns 400 when baseToken and quoteToken resolve to the same mint', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/create-pool',
      payload: {
        network: 'mainnet-beta',
        walletAddress: '82Sg8kkChhY7Qb2ptR4uLGqLg7Zm3z9v9tQ6Zb6Jk4iZ',
        baseToken: 'SOL',
        quoteToken: 'SOL',
        initialPrice: 150,
        binStep: 20,
        feeBps: 20,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/must be different/);
  });
});

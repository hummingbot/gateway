import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/connectors/orca/orca');
jest.mock('../../../../src/chains/solana/solana.config', () => ({
  ...jest.requireActual('../../../../src/chains/solana/solana.config'),
  getSolanaChainConfig: jest.fn().mockReturnValue({
    defaultNetwork: 'mainnet-beta',
    defaultWallet: 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF',
  }),
}));

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { positionsOwnedRoute } = await import('../../../../src/trading/clmm/positions-owned');
  await server.register(positionsOwnedRoute);
  return server;
};

const mockWalletAddress = 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF';

describe('GET /positions-owned', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 400 for invalid wallet address', async () => {
    (Orca.getInstance as jest.Mock).mockResolvedValue({ getPositionsForWalletAddress: jest.fn() });

    const response = await app.inject({
      method: 'GET',
      url: '/positions-owned',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'orca',
        walletAddress: 'invalid-address',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should handle errors from Orca connector', async () => {
    const mockOrca = {
      getPositionsForWalletAddress: jest.fn().mockRejectedValue(new Error('Failed to fetch positions')),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

    const response = await app.inject({
      method: 'GET',
      url: '/positions-owned',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'orca',
        walletAddress: mockWalletAddress,
      },
    });

    expect(response.statusCode).toBe(500);
  });
});

import { Solana } from '../../../../src/chains/solana/solana';
import { Raydium } from '../../../../src/connectors/raydium/raydium';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/raydium/raydium');

const mockSOL = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', decimals: 9 };
const mockWallet = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { createPoolRoute } = await import('../../../../src/trading/trading-amm-routes/create-pool');
  await server.register(createPoolRoute);
  return server;
};

describe('POST /create-pool (Raydium CPMM)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      // Resolve both tokens to the same mint so the base != quote guard fires.
      getToken: jest.fn(() => Promise.resolve(mockSOL)),
    });
    (Raydium.getInstance as jest.Mock).mockResolvedValue({
      setOwner: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('rejects when baseToken and quoteToken resolve to the same mint', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/create-pool',
      payload: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'raydium',
        walletAddress: mockWallet,
        baseToken: 'SOL',
        quoteToken: 'SOL',
        baseTokenAmount: 1,
        quoteTokenAmount: 150,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/must be different/);
  });
});

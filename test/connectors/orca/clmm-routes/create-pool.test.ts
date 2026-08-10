import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');

const mockSOL = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', decimals: 9 };
const mockWallet = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { createPoolRoute } = await import('../../../../src/connectors/orca/clmm-routes/createPool');
  await server.register(createPoolRoute);
  return server;
};

describe('POST /create-pool (Orca CLMM)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Whirlpool client only needs to expose the wallet pubkey used as the createPool funder.
    (Orca.getInstance as jest.Mock).mockResolvedValue({
      getWhirlpoolClientForWallet: jest.fn().mockResolvedValue({
        getContext: () => ({ wallet: { publicKey: new PublicKey(mockWallet) } }),
        getFetcher: () => ({ getMintInfo: jest.fn() }),
      }),
    });
  });

  it('rejects when baseToken and quoteToken resolve to the same mint', async () => {
    // Resolve both tokens to the same mint so the base != quote guard fires before any SDK call.
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      getToken: jest.fn(() => Promise.resolve(mockSOL)),
    });

    const response = await server.inject({
      method: 'POST',
      url: '/create-pool',
      payload: {
        network: 'mainnet-beta',
        walletAddress: mockWallet,
        baseToken: 'SOL',
        quoteToken: 'SOL',
        tickSpacing: 64,
        initialPrice: 150,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/must be different/);
  });

  it('rejects when tickSpacing is not a positive integer', async () => {
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      getToken: jest.fn(() => Promise.resolve(mockSOL)),
    });

    const response = await server.inject({
      method: 'POST',
      url: '/create-pool',
      payload: {
        network: 'mainnet-beta',
        walletAddress: mockWallet,
        baseToken: 'SOL',
        quoteToken: 'USDC',
        tickSpacing: 0,
        initialPrice: 150,
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

import { Solana } from '../../../../src/chains/solana/solana';
import { Raydium } from '../../../../src/connectors/raydium/raydium';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/raydium/raydium');
// Stub getMint so decimals resolve without a real RPC; keep the rest of spl-token real.
jest.mock('@solana/spl-token', () => ({
  ...jest.requireActual('@solana/spl-token'),
  getMint: jest.fn(() => Promise.resolve({ decimals: 9 })),
}));

const mockSOL = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', decimals: 9 };
const mockUSDC = { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 };
const mockWallet = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { createPoolRoute } = await import('../../../../src/trading/trading-clmm-routes/create-pool');
  await server.register(createPoolRoute);
  return server;
};

describe('POST /create-pool (Raydium CLMM)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (Raydium.getInstance as jest.Mock).mockResolvedValue({
      setOwner: jest.fn().mockResolvedValue(undefined),
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
        chainNetwork: 'solana-mainnet-beta',
        connector: 'raydium',
        walletAddress: mockWallet,
        baseToken: 'SOL',
        quoteToken: 'SOL',
        initialPrice: 150,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/must be different/);
  });

  it('rejects when ammConfigIndex is out of range', async () => {
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      network: 'mainnet-beta',
      getToken: jest.fn((t: string) => Promise.resolve(t === 'SOL' ? mockSOL : mockUSDC)),
      connection: {
        // getMintProgram reads the mint account owner — return the classic SPL Token program.
        getAccountInfo: jest.fn(() => Promise.resolve({ owner: TOKEN_PROGRAM_ID })),
      },
    });

    (Raydium.getInstance as jest.Mock).mockResolvedValue({
      setOwner: jest.fn().mockResolvedValue(undefined),
      txVersion: 0,
      raydiumSDK: {
        api: {
          // Single config available -> requested index 5 is out of range.
          getClmmConfigs: jest.fn(() =>
            Promise.resolve([
              { id: 'AmmConfig1111111111111111111111111111111111', index: 0, tradeFeeRate: 100, tickSpacing: 1 },
            ]),
          ),
        },
        clmm: { createPool: jest.fn() },
      },
    });

    const response = await server.inject({
      method: 'POST',
      url: '/create-pool',
      payload: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'raydium',
        walletAddress: mockWallet,
        baseToken: 'SOL',
        quoteToken: 'USDC',
        initialPrice: 150,
        ammConfigIndex: 5,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/out of range/);
  });
});

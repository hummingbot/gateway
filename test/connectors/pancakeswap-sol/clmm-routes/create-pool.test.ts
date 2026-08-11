import { Solana } from '../../../../src/chains/solana/solana';
import {
  PancakeswapSol,
  PANCAKESWAP_CLMM_PROGRAM_ID,
} from '../../../../src/connectors/pancakeswap-sol/pancakeswap-sol';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/pancakeswap-sol/pancakeswap-sol', () => {
  const actual = jest.requireActual('../../../../src/connectors/pancakeswap-sol/pancakeswap-sol');
  return {
    ...actual,
    PancakeswapSol: { getInstance: jest.fn() },
  };
});
// Stub getMint so decimals resolve without a real RPC; keep the rest of spl-token real.
jest.mock('@solana/spl-token', () => ({
  ...jest.requireActual('@solana/spl-token'),
  getMint: jest.fn(() => Promise.resolve({ decimals: 9 })),
}));

const mockSOL = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', decimals: 9 };
const mockUSDC = { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 };
const mockWallet = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';
const mockAmmConfig = 'E64NGkDLLCdQ2yFNPcavaKptrEgmiQaNykUuLC1Qgwyp';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { createPoolRoute } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/createPool');
  await server.register(createPoolRoute);
  return server;
};

describe('POST /create-pool (PancakeSwap Solana CLMM)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (PancakeswapSol.getInstance as jest.Mock).mockResolvedValue({});
  });

  it('rejects when baseToken and quoteToken resolve to the same mint', async () => {
    // amm_config exists (owned by the CLMM program) so validation passes to the base != quote guard.
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      network: 'mainnet-beta',
      getToken: jest.fn(() => Promise.resolve(mockSOL)),
      connection: {
        getAccountInfo: jest.fn(() => Promise.resolve({ owner: PANCAKESWAP_CLMM_PROGRAM_ID })),
      },
    });

    const response = await server.inject({
      method: 'POST',
      url: '/create-pool',
      payload: {
        network: 'mainnet-beta',
        walletAddress: mockWallet,
        baseToken: 'SOL',
        quoteToken: 'SOL',
        initialPrice: 150,
        ammConfig: mockAmmConfig,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/must be different/);
  });

  it('rejects when ammConfig is missing', async () => {
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      network: 'mainnet-beta',
      getToken: jest.fn((t: string) => Promise.resolve(t === 'SOL' ? mockSOL : mockUSDC)),
      connection: { getAccountInfo: jest.fn(() => Promise.resolve(null)) },
    });

    const response = await server.inject({
      method: 'POST',
      url: '/create-pool',
      payload: {
        network: 'mainnet-beta',
        walletAddress: mockWallet,
        baseToken: 'SOL',
        quoteToken: 'USDC',
        initialPrice: 150,
        // ammConfig intentionally omitted — the schema requires it, so this is rejected as a bad request.
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

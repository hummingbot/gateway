import { Solana } from '../../../../src/chains/solana/solana';
import { Titan } from '../../../../src/connectors/titan/titan';
import { quoteCache } from '../../../../src/services/quote-cache';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/titan/titan');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { quoteSwapRoute } = await import('../../../../src/trading/trading-router-routes/quoteSwap');
  await server.register(quoteSwapRoute);
  return server;
};

const mockSOL = {
  symbol: 'SOL',
  address: 'So11111111111111111111111111111111111111112',
  decimals: 9,
};

const mockUSDC = {
  symbol: 'USDC',
  address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  decimals: 6,
};

const WALLET = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';

const sellRoute = {
  provider: 'Titan-DART',
  inputAmount: '100000000', // 0.1 SOL
  outputAmount: '15000000', // 15 USDC
  slippageBps: 50,
  instructions: [
    {
      programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
      accounts: [{ pubkey: WALLET, isSigner: true, isWritable: true }],
      data: Buffer.from('deadbeef', 'hex').toString('base64'),
    },
  ],
  addressLookupTables: ['9mQGjcTFmhVDMEkP7Nq3wzYRTztTv8XibnwvyR3ZQ1FS'],
};

describe('GET /quote-swap (titan)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockSolana = () => {
    const mockSolanaInstance = {
      getToken: jest.fn().mockResolvedValueOnce(mockSOL).mockResolvedValueOnce(mockUSDC),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);
    return mockSolanaInstance;
  };

  it('should return a wallet-bound swap quote for SELL side', async () => {
    mockSolana();
    const mockTitanInstance = {
      getSwapRoute: jest.fn().mockResolvedValue(sellRoute),
    };
    (Titan.getInstance as jest.Mock).mockResolvedValue(mockTitanInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'titan',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
        slippagePct: '0.5',
        walletAddress: WALLET,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('quoteId');
    expect(body).toHaveProperty('amountIn', 0.1);
    expect(body).toHaveProperty('amountOut', 15);
    expect(body).toHaveProperty('price', 150);
    // `wallet` was a Titan-specific echo field; the unified router response carries
    // the shared quote fields plus quoteId. The wallet is still what the quote was
    // priced for — asserted below on the call itself.
    expect(body.approximation).toBeUndefined();

    // The route was requested for the provided wallet
    expect(mockTitanInstance.getSwapRoute).toHaveBeenCalledWith(
      mockSOL.address,
      mockUSDC.address,
      '100000000',
      WALLET,
      50,
    );

    // Cached quote is bound to the wallet for the execute-quote wallet-match check
    const cached = quoteCache.get(body.quoteId);
    expect(cached.wallet).toBe(WALLET);
    expect(cached.connector).toBe('titan');
    quoteCache.delete(body.quoteId);
  });

  it('should approximate BUY via sell leg (Titan DART is ExactIn-only)', async () => {
    mockSolana();
    const mockTitanInstance = {
      getSwapRoute: jest
        .fn()
        // Sell leg: 0.1 SOL -> 15 USDC
        .mockResolvedValueOnce(sellRoute)
        // Forward leg: 15 USDC -> 0.0999 SOL
        .mockResolvedValueOnce({
          ...sellRoute,
          inputAmount: '15000000',
          outputAmount: '99900000',
        }),
    };
    (Titan.getInstance as jest.Mock).mockResolvedValue(mockTitanInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'titan',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'BUY',
        slippagePct: '0.5',
        walletAddress: WALLET,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('approximation', true);
    expect(body).toHaveProperty('amountIn', 15);
    expect(body.amountOut).toBeCloseTo(0.0999);
    expect(body.maxAmountIn).toBeCloseTo(15);
    expect(body.minAmountOut).toBeCloseTo(0.0999 * (1 - 0.005));
    expect(mockTitanInstance.getSwapRoute).toHaveBeenCalledTimes(2);
    quoteCache.delete(body.quoteId);
  });

  it('should return 400 for BUY when approximation is disabled', async () => {
    mockSolana();
    const mockTitanInstance = { getSwapRoute: jest.fn() };
    (Titan.getInstance as jest.Mock).mockResolvedValue(mockTitanInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'titan',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'BUY',
        slippagePct: '0.5',
        walletAddress: WALLET,
        approximateIfNoExactOut: 'false',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toContain('ExactIn only');
    expect(mockTitanInstance.getSwapRoute).not.toHaveBeenCalled();
  });

  it('should return 400 if token not found', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(mockUSDC),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);
    (Titan.getInstance as jest.Mock).mockResolvedValue({ getSwapRoute: jest.fn() });

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'titan',
        baseToken: 'INVALID',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
        walletAddress: WALLET,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });

  it('should return 400 if no route found for SELL', async () => {
    mockSolana();
    const mockTitanInstance = {
      getSwapRoute: jest.fn().mockRejectedValue(new Error('Titan API error: no route')),
    };
    (Titan.getInstance as jest.Mock).mockResolvedValue(mockTitanInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'titan',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
        walletAddress: WALLET,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toContain('No route found');
  });
});

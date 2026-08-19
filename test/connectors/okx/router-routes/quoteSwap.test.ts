import { Solana } from '../../../../src/chains/solana/solana';
import { Okx } from '../../../../src/connectors/okx/okx';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/okx/okx');

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

describe('GET /quote-swap (okx)', () => {
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

  it('should return a swap quote for SELL side', async () => {
    mockSolana();
    const mockOkxInstance = {
      getQuote: jest.fn().mockResolvedValue({
        fromTokenAmount: '100000000', // 0.1 SOL
        toTokenAmount: '15000000', // 15 USDC
        priceImpactPercent: '0.05',
      }),
    };
    (Okx.getInstance as jest.Mock).mockResolvedValue(mockOkxInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'okx',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
        slippagePct: '0.5',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('quoteId');
    expect(body).toHaveProperty('amountIn', 0.1);
    expect(body).toHaveProperty('amountOut', 15);
    expect(body).toHaveProperty('price', 150);
    expect(body).toHaveProperty('priceImpactPct', 0.05);
    expect(body).toHaveProperty('tokenIn', mockSOL.address);
    expect(body).toHaveProperty('tokenOut', mockUSDC.address);
    // The connector's raw provider payload (quoteResponse / routerResult) is not part
    // of the unified router response schema, which serializes the shared quote fields
    // plus quoteId. Assertions on it moved out with the per-connector route.
    expect(body.approximation).toBeUndefined();

    expect(mockOkxInstance.getQuote).toHaveBeenCalledWith(mockSOL.address, mockUSDC.address, '100000000', 'exactIn');
  });

  it('should use native exactOut for BUY side when supported', async () => {
    mockSolana();
    const mockOkxInstance = {
      getQuote: jest.fn().mockResolvedValue({
        fromTokenAmount: '15000000', // 15 USDC in
        toTokenAmount: '100000000', // 0.1 SOL out
        priceImpactPercent: '0.05',
      }),
    };
    (Okx.getInstance as jest.Mock).mockResolvedValue(mockOkxInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'okx',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'BUY',
        slippagePct: '0.5',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('amountIn', 15);
    expect(body).toHaveProperty('amountOut', 0.1);
    expect(body.approximation).toBeUndefined();
    // maxAmountIn includes slippage buffer for native exactOut
    expect(body.maxAmountIn).toBeCloseTo(15 * 1.005);
    expect(mockOkxInstance.getQuote).toHaveBeenCalledTimes(1);
    expect(mockOkxInstance.getQuote).toHaveBeenCalledWith(mockUSDC.address, mockSOL.address, '100000000', 'exactOut');
  });

  it('should approximate BUY via sell leg when exactOut fails', async () => {
    mockSolana();
    const mockOkxInstance = {
      getQuote: jest
        .fn()
        // exactOut attempt fails
        .mockRejectedValueOnce(new Error('OKX API error: exactOut not supported'))
        // Sell leg: 0.1 SOL -> 15 USDC
        .mockResolvedValueOnce({
          fromTokenAmount: '100000000',
          toTokenAmount: '15000000',
          priceImpactPercent: '0.05',
        })
        // Forward leg: 15 USDC -> 0.0999 SOL
        .mockResolvedValueOnce({
          fromTokenAmount: '15000000',
          toTokenAmount: '99900000',
          priceImpactPercent: '0.05',
        }),
    };
    (Okx.getInstance as jest.Mock).mockResolvedValue(mockOkxInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'okx',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'BUY',
        slippagePct: '0.5',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('approximation', true);
    expect(body).toHaveProperty('amountIn', 15);
    expect(body.amountOut).toBeCloseTo(0.0999);
    expect(body.maxAmountIn).toBeCloseTo(15);
    expect(body.minAmountOut).toBeCloseTo(0.0999 * (1 - 0.005));
    expect(mockOkxInstance.getQuote).toHaveBeenCalledTimes(3);
  });

  it('should return 400 for BUY when exactOut fails and approximation is disabled', async () => {
    mockSolana();
    const mockOkxInstance = {
      getQuote: jest.fn().mockRejectedValue(new Error('OKX API error: exactOut not supported')),
    };
    (Okx.getInstance as jest.Mock).mockResolvedValue(mockOkxInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'okx',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'BUY',
        slippagePct: '0.5',
        approximateIfNoExactOut: 'false',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toContain('No route found');
    expect(mockOkxInstance.getQuote).toHaveBeenCalledTimes(1);
  });

  it('should return 400 if token not found', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(mockUSDC),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);
    (Okx.getInstance as jest.Mock).mockResolvedValue({ getQuote: jest.fn() });

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'okx',
        baseToken: 'INVALID',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });
});

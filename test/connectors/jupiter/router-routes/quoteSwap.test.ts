import { Solana } from '../../../../src/chains/solana/solana';
import { Jupiter } from '../../../../src/connectors/jupiter/jupiter';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';
import { parseWire } from '../../../utils/wire';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/jupiter/jupiter');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  try {
    const { quoteSwapRoute } = await import('../../../../src/trading/trading-router-routes/quoteSwap');
    await server.register(quoteSwapRoute);
  } catch (error) {
    console.error('Failed to import route:', error);
    throw error;
  }
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

const mockQuoteResponse = {
  inAmount: '100000000', // 0.1 SOL
  outAmount: '15000000', // 15 USDC
  priceImpactPct: '0.001',
  marketInfos: [],
  slippageBps: 50,
};

describe('GET /quote-swap', () => {
  let server: any;

  beforeAll(async () => {
    try {
      server = await buildApp();
    } catch (error) {
      console.error('Failed to build app:', error);
      throw error;
    }
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a swap quote for SELL side', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn().mockResolvedValueOnce(mockSOL).mockResolvedValueOnce(mockUSDC),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockJupiterInstance = {
      getQuote: jest.fn().mockResolvedValue(mockQuoteResponse),
    };
    (Jupiter.getInstance as jest.Mock).mockResolvedValue(mockJupiterInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'jupiter',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
        slippagePct: '0.5',
      },
    });

    if (response.statusCode !== 200) {
      console.log('Response error:', parseWire(response.body));
    }
    expect(response.statusCode).toBe(200);
    const body = parseWire(response.body);
    expect(body).toHaveProperty('quoteId');
    expect(Number(body.amountIn)).toBe(0.1);
    expect(body).toHaveProperty('amountOut', 15);
    expect(body).toHaveProperty('minAmountOut');
    expect(body).toHaveProperty('maxAmountIn');
    expect(body).toHaveProperty('price', 150);
    // The connector's raw provider payload (quoteResponse / routerResult) is not part
    // of the unified router response schema, which serializes the shared quote fields
    // plus quoteId. Assertions on it moved out with the per-connector route.
    expect(body).toHaveProperty('tokenIn', mockSOL.address);
    expect(body).toHaveProperty('tokenOut', mockUSDC.address);
  });

  it('should return a price quote for BUY side', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn().mockResolvedValueOnce(mockSOL).mockResolvedValueOnce(mockUSDC),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockJupiterInstance = {
      getQuote: jest.fn().mockResolvedValue({
        inAmount: '15000000', // 15 USDC
        outAmount: '100000000', // 0.1 SOL
        priceImpactPct: '0.001',
        marketInfos: [],
        slippageBps: 50,
      }),
    };
    (Jupiter.getInstance as jest.Mock).mockResolvedValue(mockJupiterInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'jupiter',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'BUY',
        slippagePct: '0.5',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = parseWire(response.body);
    expect(body).toHaveProperty('quoteId');
    expect(Number(body.amountIn)).toBe(15);
    expect(body).toHaveProperty('amountOut', 0.1);
    expect(body).toHaveProperty('minAmountOut');
    expect(body).toHaveProperty('maxAmountIn');
    expect(body).toHaveProperty('price', 150);
    expect(body).toHaveProperty('tokenIn', mockUSDC.address);
    expect(body).toHaveProperty('tokenOut', mockSOL.address);
  });

  it('should return 400 if token not found', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(mockUSDC),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'jupiter',
        baseToken: 'INVALID',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(parseWire(response.body)).toHaveProperty('error');
  });

  it('should return 400 if no routes found', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn().mockResolvedValueOnce(mockSOL).mockResolvedValueOnce(mockUSDC),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockJupiterInstance = {
      getQuote: jest.fn().mockResolvedValue(null),
    };
    (Jupiter.getInstance as jest.Mock).mockResolvedValue(mockJupiterInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'jupiter',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
        slippagePct: '0.5',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(parseWire(response.body)).toHaveProperty('error');
  });

  it('should approximate BUY via sell leg when ExactOut is not supported', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn().mockResolvedValueOnce(mockSOL).mockResolvedValueOnce(mockUSDC),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockJupiterInstance = {
      getQuote: jest
        .fn()
        // ExactOut attempt fails with Jupiter's specific error
        .mockRejectedValueOnce(new Error('ExactOut not supported for this token pair'))
        // Sell leg: 0.1 SOL -> 15 USDC
        .mockResolvedValueOnce({
          inAmount: '100000000',
          outAmount: '15000000',
          priceImpactPct: '0.001',
          routePlan: [],
          slippageBps: 50,
        })
        // Forward leg: 15 USDC -> 0.0999 SOL
        .mockResolvedValueOnce({
          inAmount: '15000000',
          outAmount: '99900000',
          priceImpactPct: '0.001',
          routePlan: [],
          slippageBps: 50,
        }),
    };
    (Jupiter.getInstance as jest.Mock).mockResolvedValue(mockJupiterInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'jupiter',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'BUY',
        slippagePct: '0.5',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = parseWire(response.body);
    expect(body).toHaveProperty('approximation', true);
    expect(Number(body.amountIn)).toBe(15);
    expect(body.amountOut).toBeCloseTo(0.0999);
    // Input is fixed for the approximated ExactIn quote
    expect(body.maxAmountIn).toBeCloseTo(15);
    // Slippage applies to the estimated output
    expect(body.minAmountOut).toBeCloseTo(0.0999 * (1 - 0.005));
    // ExactOut attempt + sell leg + forward leg
    expect(mockJupiterInstance.getQuote).toHaveBeenCalledTimes(3);
  });

  it('should return 400 for BUY when ExactOut is unsupported and approximation is disabled', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn().mockResolvedValueOnce(mockSOL).mockResolvedValueOnce(mockUSDC),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockJupiterInstance = {
      getQuote: jest.fn().mockRejectedValue(new Error('ExactOut not supported for this token pair')),
    };
    (Jupiter.getInstance as jest.Mock).mockResolvedValue(mockJupiterInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'jupiter',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'BUY',
        slippagePct: '0.5',
        approximateIfNoExactOut: 'false',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = parseWire(response.body);
    expect(body.message).toContain('ExactOut');
    expect(mockJupiterInstance.getQuote).toHaveBeenCalledTimes(1);
  });

  it('should return 400 when both ExactOut and the ExactIn fallback fail for BUY side', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn().mockResolvedValueOnce(mockSOL).mockResolvedValueOnce(mockUSDC),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockJupiterInstance = {
      getQuote: jest.fn().mockRejectedValue(new Error('No route found for this token pair')),
    };
    (Jupiter.getInstance as jest.Mock).mockResolvedValue(mockJupiterInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'jupiter',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'BUY',
        slippagePct: '0.5',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = parseWire(response.body);
    expect(body).toHaveProperty('error');
    expect(body.message).toContain('No route found for');
    expect(body.message).toContain('SOL');
    expect(body.message).toContain('USDC');
    expect(body.message).toContain('ExactOut, ExactIn fallback failed');
    // Should include Jupiter's original error message
    expect(body.message).toContain('No route found for this token pair');

    // ExactOut attempt, then the reverse ExactIn probe of the fallback (which also fails)
    expect(mockJupiterInstance.getQuote).toHaveBeenCalledTimes(2);

    // First call is the ExactOut attempt
    expect(mockJupiterInstance.getQuote).toHaveBeenNthCalledWith(
      1,
      mockUSDC.address,
      mockSOL.address,
      0.1,
      0.5,
      false,
      true,
      'ExactOut',
    );
    // Second call is the reverse (base -> quote) ExactIn pricing probe
    expect(mockJupiterInstance.getQuote).toHaveBeenNthCalledWith(
      2,
      mockSOL.address,
      mockUSDC.address,
      0.1,
      0.5,
      false,
      true,
      'ExactIn',
    );
  });
});

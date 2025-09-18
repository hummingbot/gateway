import { Solana } from '../../../../src/chains/solana/solana';
import { Jupiter } from '../../../../src/connectors/jupiter/jupiter';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/jupiter/jupiter');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  try {
    const { quoteSwapRoute } = await import('../../../../src/connectors/jupiter/router-routes/quoteSwap');
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
        network: 'mainnet-beta',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
        slippagePct: '0.5',
      },
    });

    if (response.statusCode !== 200) {
      console.log('Response error:', JSON.parse(response.body));
    }
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('quoteId');
    expect(body).toHaveProperty('amountIn', 0.1);
    expect(body).toHaveProperty('amountOut', 15);
    expect(body).toHaveProperty('minAmountOut');
    expect(body).toHaveProperty('maxAmountIn');
    expect(body).toHaveProperty('price', 150);
    expect(body.quoteResponse).toHaveProperty('priceImpactPct', '0.001');
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
        network: 'mainnet-beta',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'BUY',
        slippagePct: '0.5',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('quoteId');
    expect(body).toHaveProperty('amountIn', 15);
    expect(body).toHaveProperty('amountOut', 0.1);
    expect(body).toHaveProperty('minAmountOut');
    expect(body).toHaveProperty('maxAmountIn');
    expect(body).toHaveProperty('price', 150);
    expect(body.quoteResponse).toHaveProperty('priceImpactPct', '0.001');
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
        network: 'mainnet-beta',
        baseToken: 'INVALID',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });

  it('should return 404 if no routes found', async () => {
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
        network: 'mainnet-beta',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
        slippagePct: '0.5',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });

  it('should fall back to ExactIn approximation when ExactOut fails for BUY side', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn().mockResolvedValueOnce(mockSOL).mockResolvedValueOnce(mockUSDC),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockJupiterInstance = {
      getQuote: jest
        .fn()
        // First call fails with ExactOut not supported
        .mockRejectedValueOnce(new Error('ExactOut not supported for this token pair'))
        // Second call (approximation attempt 1) returns a quote close to target
        .mockResolvedValueOnce({
          inAmount: '15300000', // 15.3 USDC (slightly more than ideal)
          outAmount: '102000000', // 0.102 SOL (slightly more than target 0.1)
          priceImpactPct: '0.001',
          marketInfos: [],
          slippageBps: 50,
        })
        // Third call (approximation attempt 2) returns closer to target
        .mockResolvedValueOnce({
          inAmount: '15000000', // 15 USDC
          outAmount: '100000000', // 0.1 SOL (exactly the target)
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
        network: 'mainnet-beta',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'BUY',
        slippagePct: '0.5',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    // Should have the approximation flag
    expect(body).toHaveProperty('approximation', true);

    // Should have quote details from the successful approximation
    expect(body).toHaveProperty('quoteId');
    expect(body).toHaveProperty('amountIn', 15);
    expect(body).toHaveProperty('amountOut', 0.1);
    expect(body).toHaveProperty('tokenIn', mockUSDC.address);
    expect(body).toHaveProperty('tokenOut', mockSOL.address);

    // Verify that getQuote was called 3 times (1 ExactOut fail + 2 ExactIn attempts)
    expect(mockJupiterInstance.getQuote).toHaveBeenCalledTimes(3);

    // First call should be ExactOut
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

    // Subsequent calls should be ExactIn approximations
    expect(mockJupiterInstance.getQuote).toHaveBeenNthCalledWith(
      2,
      mockUSDC.address,
      mockSOL.address,
      expect.any(Number),
      0.5,
      false,
      true,
      'ExactIn',
    );
  });
});

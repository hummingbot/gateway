import { Solana } from '../../../../src/chains/solana/solana';
import { Jupiter } from '../../../../src/connectors/jupiter/jupiter';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/jupiter/jupiter');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { getPriceRoute } = await import(
    '../../../../src/connectors/jupiter/swap-routes-v2/get-price'
  );
  await server.register(getPriceRoute);
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

describe('GET /get-price', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a price quote for SELL side', async () => {
    const mockSolanaInstance = {
      getToken: jest
        .fn()
        .mockResolvedValueOnce(mockSOL)
        .mockResolvedValueOnce(mockUSDC),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockJupiterInstance = {
      getQuote: jest.fn().mockResolvedValue(mockQuoteResponse),
    };
    (Jupiter.getInstance as jest.Mock).mockResolvedValue(mockJupiterInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/get-price',
      query: {
        network: 'mainnet-beta',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('estimatedAmountIn', 0.1);
    expect(body).toHaveProperty('estimatedAmountOut', 15);
    expect(body).toHaveProperty('price', 150);
    expect(body).toHaveProperty('priceImpactPct', 0.001);
    expect(body).toHaveProperty('tokenIn', mockSOL.address);
    expect(body).toHaveProperty('tokenOut', mockUSDC.address);
    expect(body).toHaveProperty('tokenInAmount', 0.1);
    expect(body).toHaveProperty('tokenOutAmount', 15);
  });

  it('should return a price quote for BUY side', async () => {
    const mockSolanaInstance = {
      getToken: jest
        .fn()
        .mockResolvedValueOnce(mockSOL)
        .mockResolvedValueOnce(mockUSDC),
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
      url: '/get-price',
      query: {
        network: 'mainnet-beta',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'BUY',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('estimatedAmountIn', 15);
    expect(body).toHaveProperty('estimatedAmountOut', 0.1);
    expect(body).toHaveProperty('price', 150);
    expect(body).toHaveProperty('priceImpactPct', 0.001);
    expect(body).toHaveProperty('tokenIn', mockUSDC.address);
    expect(body).toHaveProperty('tokenOut', mockSOL.address);
  });

  it('should return 400 if token not found', async () => {
    const mockSolanaInstance = {
      getToken: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockUSDC),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/get-price',
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
      getToken: jest
        .fn()
        .mockResolvedValueOnce(mockSOL)
        .mockResolvedValueOnce(mockUSDC),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockJupiterInstance = {
      getQuote: jest.fn().mockResolvedValue(null),
    };
    (Jupiter.getInstance as jest.Mock).mockResolvedValue(mockJupiterInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/get-price',
      query: {
        network: 'mainnet-beta',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });
});

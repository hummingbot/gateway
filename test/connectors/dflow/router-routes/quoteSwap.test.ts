import { Solana } from '../../../../src/chains/solana/solana';
import { DFlow } from '../../../../src/connectors/dflow/dflow';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';
import { parseWire } from '../../../utils/wire';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/dflow/dflow');

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

const sellQuote = {
  inputMint: mockSOL.address,
  inAmount: '100000000', // 0.1 SOL
  outputMint: mockUSDC.address,
  outAmount: '15000000', // 15 USDC
  otherAmountThreshold: '14900000',
  slippageBps: 50,
  priceImpactPct: '0.001',
  routePlan: [],
};

describe('GET /quote-swap (dflow)', () => {
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
    const mockDFlowInstance = {
      getQuote: jest.fn().mockResolvedValue(sellQuote),
    };
    (DFlow.getInstance as jest.Mock).mockResolvedValue(mockDFlowInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'dflow',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
        slippagePct: '0.5',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = parseWire(response.body);
    expect(body).toHaveProperty('quoteId');
    expect(Number(body.amountIn)).toBe(0.1);
    expect(body).toHaveProperty('amountOut', 15);
    expect(body).toHaveProperty('price', 150);
    expect(body).toHaveProperty('tokenIn', mockSOL.address);
    expect(body).toHaveProperty('tokenOut', mockUSDC.address);
    // The connector's raw provider payload (quoteResponse / routerResult) is not part
    // of the unified router response schema, which serializes the shared quote fields
    // plus quoteId. Assertions on it moved out with the per-connector route.
    expect(body.approximation).toBeUndefined();

    // ExactIn with the base amount in raw units
    expect(mockDFlowInstance.getQuote).toHaveBeenCalledWith(mockSOL.address, mockUSDC.address, '100000000', 50);
  });

  it('should approximate BUY via sell leg (DFlow is ExactIn-only)', async () => {
    mockSolana();
    const mockDFlowInstance = {
      getQuote: jest
        .fn()
        // Sell leg: 0.1 SOL -> 15 USDC
        .mockResolvedValueOnce({ ...sellQuote })
        // Forward leg: 15 USDC -> 0.0999 SOL
        .mockResolvedValueOnce({
          ...sellQuote,
          inputMint: mockUSDC.address,
          inAmount: '15000000',
          outputMint: mockSOL.address,
          outAmount: '99900000',
        }),
    };
    (DFlow.getInstance as jest.Mock).mockResolvedValue(mockDFlowInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'dflow',
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
    expect(mockDFlowInstance.getQuote).toHaveBeenCalledTimes(2);
  });

  it('should return 400 for BUY when approximation is disabled', async () => {
    mockSolana();
    const mockDFlowInstance = { getQuote: jest.fn() };
    (DFlow.getInstance as jest.Mock).mockResolvedValue(mockDFlowInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'dflow',
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
    expect(body.message).toContain('ExactIn only');
    expect(mockDFlowInstance.getQuote).not.toHaveBeenCalled();
  });

  it('should return 400 if token not found', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(mockUSDC),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);
    (DFlow.getInstance as jest.Mock).mockResolvedValue({ getQuote: jest.fn() });

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'dflow',
        baseToken: 'INVALID',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(parseWire(response.body)).toHaveProperty('error');
  });

  it('should return 400 if no routes found for SELL', async () => {
    mockSolana();
    const mockDFlowInstance = {
      getQuote: jest.fn().mockRejectedValue(new Error('DFlow API error: no route')),
    };
    (DFlow.getInstance as jest.Mock).mockResolvedValue(mockDFlowInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'dflow',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = parseWire(response.body);
    expect(body.message).toContain('No route found');
  });
});

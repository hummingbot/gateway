import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { ZeroX } from '../../../../src/connectors/0x/0x';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/0x/0x');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { getPriceRoute } = await import(
    '../../../../src/connectors/0x/router-routes/getPrice'
  );
  await server.register(getPriceRoute);
  return server;
};

const mockWETH = {
  symbol: 'WETH',
  address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  decimals: 18,
};

const mockUSDC = {
  symbol: 'USDC',
  address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  decimals: 6,
};

const mockQuoteResponse = {
  sellToken: mockWETH.address,
  buyToken: mockUSDC.address,
  sellAmount: '100000000000000000', // 0.1 ETH
  buyAmount: '150000000', // 150 USDC
  price: '1500',
  estimatedPriceImpact: '0.001',
  gas: '200000',
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
    const mockEthereumInstance = {
      getTokenBySymbol: jest
        .fn()
        .mockResolvedValueOnce(mockWETH)
        .mockResolvedValueOnce(mockUSDC),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);

    const mockZeroXInstance = {
      parseTokenAmount: jest.fn().mockReturnValue('100000000000000000'),
      formatTokenAmount: jest
        .fn()
        .mockReturnValueOnce('0.1')
        .mockReturnValueOnce('150'),
      getPrice: jest.fn().mockResolvedValue(mockQuoteResponse),
    };
    (ZeroX.getInstance as jest.Mock).mockResolvedValue(mockZeroXInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/get-price',
      query: {
        network: 'mainnet',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('estimatedAmountIn', 0.1);
    expect(body).toHaveProperty('estimatedAmountOut', 150);
    expect(body).toHaveProperty('price');
    expect(body).toHaveProperty('priceImpactPct');
    expect(body).toHaveProperty('tokenIn', mockWETH.address);
    expect(body).toHaveProperty('tokenOut', mockUSDC.address);
  });

  it('should return a price quote for BUY side', async () => {
    const mockEthereumInstance = {
      getTokenBySymbol: jest
        .fn()
        .mockResolvedValueOnce(mockWETH)
        .mockResolvedValueOnce(mockUSDC),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);

    const mockZeroXInstance = {
      parseTokenAmount: jest.fn().mockReturnValue('100000000000000000'), // Parse amount for BUY side (in WETH)
      formatTokenAmount: jest
        .fn()
        .mockReturnValueOnce('150') // Format sellAmount (USDC)
        .mockReturnValueOnce('0.1'), // Format buyAmount (WETH)
      getPrice: jest.fn().mockResolvedValue({
        ...mockQuoteResponse,
        sellToken: mockUSDC.address,
        buyToken: mockWETH.address,
        sellAmount: '150000000', // 150 USDC
        buyAmount: '100000000000000000', // 0.1 WETH
      }),
    };
    (ZeroX.getInstance as jest.Mock).mockResolvedValue(mockZeroXInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/get-price',
      query: {
        network: 'mainnet',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'BUY',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('estimatedAmountIn', 150);
    expect(body).toHaveProperty('estimatedAmountOut', 0.1);
    expect(body).toHaveProperty('price');
    expect(body).toHaveProperty('priceImpactPct');
    expect(body).toHaveProperty('tokenIn', mockUSDC.address);
    expect(body).toHaveProperty('tokenOut', mockWETH.address);
  });

  it('should return 400 if token not found', async () => {
    const mockEthereumInstance = {
      getTokenBySymbol: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockUSDC),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/get-price',
      query: {
        network: 'mainnet',
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

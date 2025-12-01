import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { ZeroX } from '../../../../src/connectors/0x/0x';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/0x/0x');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { quoteSwapRoute } = await import('../../../../src/connectors/0x/router-routes/quoteSwap');
  await server.register(quoteSwapRoute);
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
  estimatedGas: '200000',
  allowanceTarget: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
  to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
  data: '0x1234567890',
  value: '0',
};

describe('GET /quote-swap', () => {
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

  it('should return an executable quote for SELL side', async () => {
    const mockEthereumInstance = {
      getToken: jest.fn().mockReturnValueOnce(mockWETH).mockReturnValueOnce(mockUSDC),
      getOrFetchToken: jest.fn().mockResolvedValueOnce(mockWETH).mockResolvedValueOnce(mockUSDC),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);
    (Ethereum.getWalletAddressExample as jest.Mock).mockResolvedValue('0x1234567890123456789012345678901234567890');

    const mockZeroXInstance = {
      parseTokenAmount: jest.fn().mockReturnValue('100000000000000000'),
      formatTokenAmount: jest.fn().mockReturnValueOnce('0.1').mockReturnValueOnce('150'),
      convertSlippageToPercentage: jest.fn().mockReturnValue(0.005),
      getQuote: jest.fn().mockResolvedValue(mockQuoteResponse),
    };
    (ZeroX.getInstance as jest.Mock).mockResolvedValue(mockZeroXInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
        slippagePct: '0.5',
        indicativePrice: 'false',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('quoteId');
    expect(body).toHaveProperty('amountIn', 0.1);
    expect(body).toHaveProperty('amountOut', 150);
    expect(body).toHaveProperty('minAmountOut');
    expect(body).toHaveProperty('maxAmountIn');
    expect(body).toHaveProperty('price');
    expect(body).toHaveProperty('priceImpactPct');
    expect(body).toHaveProperty('gasEstimate', '200000');
    expect(body).toHaveProperty('expirationTime');
    expect(body).toHaveProperty('tokenIn', mockWETH.address);
    expect(body).toHaveProperty('tokenOut', mockUSDC.address);
  });

  it('should return an executable quote for BUY side', async () => {
    const mockEthereumInstance = {
      getToken: jest.fn().mockReturnValueOnce(mockWETH).mockReturnValueOnce(mockUSDC),
      getOrFetchToken: jest.fn().mockResolvedValueOnce(mockWETH).mockResolvedValueOnce(mockUSDC),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);
    (Ethereum.getWalletAddressExample as jest.Mock).mockResolvedValue('0x1234567890123456789012345678901234567890');

    const mockZeroXInstance = {
      parseTokenAmount: jest.fn().mockReturnValue('100000000000000000'),
      formatTokenAmount: jest.fn().mockReturnValueOnce('150').mockReturnValueOnce('0.1'),
      convertSlippageToPercentage: jest.fn().mockReturnValue(0.005),
      getQuote: jest.fn().mockResolvedValue({
        ...mockQuoteResponse,
        sellToken: mockUSDC.address,
        buyToken: mockWETH.address,
        sellAmount: '150000000',
        buyAmount: '100000000000000000',
      }),
    };
    (ZeroX.getInstance as jest.Mock).mockResolvedValue(mockZeroXInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'BUY',
        slippagePct: '0.5',
        indicativePrice: 'false',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('quoteId');
    expect(body).toHaveProperty('amountIn', 150);
    expect(body).toHaveProperty('amountOut', 0.1);
    expect(body).toHaveProperty('tokenIn', mockUSDC.address);
    expect(body).toHaveProperty('tokenOut', mockWETH.address);
  });

  it('should return 400 if token not found', async () => {
    const mockEthereumInstance = {
      getToken: jest.fn().mockReturnValueOnce(undefined).mockReturnValueOnce(mockUSDC),
      getOrFetchToken: jest.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(mockUSDC),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet',
        baseToken: 'INVALID',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
        slippagePct: '0.5',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });

  it('should return indicative price when indicativePrice=true', async () => {
    const mockEthereumInstance = {
      getToken: jest.fn().mockReturnValueOnce(mockWETH).mockReturnValueOnce(mockUSDC),
      getOrFetchToken: jest.fn().mockResolvedValueOnce(mockWETH).mockResolvedValueOnce(mockUSDC),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);
    (Ethereum.getWalletAddressExample as jest.Mock).mockResolvedValue('0x1234567890123456789012345678901234567890');

    const mockZeroXInstance = {
      parseTokenAmount: jest.fn().mockReturnValue('100000000000000000'),
      formatTokenAmount: jest.fn().mockReturnValueOnce('0.1').mockReturnValueOnce('150'),
      convertSlippageToPercentage: jest.fn().mockReturnValue(0.005),
      getPrice: jest.fn().mockResolvedValue(mockQuoteResponse),
      getQuote: jest.fn(),
    };
    (ZeroX.getInstance as jest.Mock).mockResolvedValue(mockZeroXInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
        slippagePct: '0.5',
        indicativePrice: 'true',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(mockZeroXInstance.getPrice).toHaveBeenCalled();
    expect(mockZeroXInstance.getQuote).not.toHaveBeenCalled();
    expect(body).toHaveProperty('quoteId', 'indicative-price');
    expect(body).toHaveProperty('amountIn', 0.1);
    expect(body).toHaveProperty('amountOut', 150);
    expect(body).not.toHaveProperty('expirationTime');
  });

  it('should default to indicative price when indicativePrice not specified', async () => {
    const mockEthereumInstance = {
      getToken: jest.fn().mockReturnValueOnce(mockWETH).mockReturnValueOnce(mockUSDC),
      getOrFetchToken: jest.fn().mockResolvedValueOnce(mockWETH).mockResolvedValueOnce(mockUSDC),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);
    (Ethereum.getWalletAddressExample as jest.Mock).mockResolvedValue('0x1234567890123456789012345678901234567890');

    const mockZeroXInstance = {
      parseTokenAmount: jest.fn().mockReturnValue('100000000000000000'),
      formatTokenAmount: jest.fn().mockReturnValueOnce('0.1').mockReturnValueOnce('150'),
      convertSlippageToPercentage: jest.fn().mockReturnValue(0.005),
      getPrice: jest.fn().mockResolvedValue(mockQuoteResponse),
      getQuote: jest.fn(),
    };
    (ZeroX.getInstance as jest.Mock).mockResolvedValue(mockZeroXInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
        slippagePct: '0.5',
        // indicativePrice not specified - should default to true
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(mockZeroXInstance.getPrice).toHaveBeenCalled();
    expect(mockZeroXInstance.getQuote).not.toHaveBeenCalled();
    expect(body).toHaveProperty('quoteId', 'indicative-price');
  });
});

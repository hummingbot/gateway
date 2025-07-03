import { Token } from '@uniswap/sdk-core';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { Uniswap } from '../../../../src/connectors/uniswap/uniswap';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/uniswap/uniswap');
jest.mock('@uniswap/smart-order-router');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { getPriceRoute } = await import(
    '../../../../src/connectors/uniswap/swap-routes-v2/get-price'
  );
  await server.register(getPriceRoute);
  return server;
};

const mockWETH = {
  symbol: 'WETH',
  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  decimals: 18,
  name: 'Wrapped Ether',
};

const mockUSDC = {
  symbol: 'USDC',
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  decimals: 6,
  name: 'USD Coin',
};

const mockRouteResponse = {
  quote: {
    toExact: () => '1500',
  },
  route: [
    {
      tokenPath: [
        new Token(1, mockWETH.address, 18, 'WETH', 'Wrapped Ether'),
        new Token(1, mockUSDC.address, 6, 'USDC', 'USD Coin'),
      ],
      protocol: 'V3',
    },
  ],
  estimatedGasUsedQuoteToken: {
    toExact: () => '0.001',
  },
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
      chainId: 1,
      provider: {},
      getTokenBySymbol: jest
        .fn()
        .mockReturnValueOnce(mockWETH)
        .mockReturnValueOnce(mockUSDC),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);

    const mockUniswapInstance = {};
    (Uniswap.getInstance as jest.Mock).mockResolvedValue(mockUniswapInstance);

    // Mock AlphaRouter
    const { AlphaRouter } = require('@uniswap/smart-order-router');
    AlphaRouter.mockImplementation(() => ({
      route: jest.fn().mockResolvedValue(mockRouteResponse),
    }));

    const response = await server.inject({
      method: 'GET',
      url: '/get-price',
      query: {
        network: 'mainnet',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: '1',
        side: 'SELL',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('price', 1500);
    expect(body).toHaveProperty('estimatedAmountIn', 1);
    expect(body).toHaveProperty('estimatedAmountOut', 1500);
    expect(body).toHaveProperty('tokenIn', mockWETH.address);
    expect(body).toHaveProperty('tokenOut', mockUSDC.address);
    // Route extraction from AlphaRouter mock might need adjustment
    // For now, just check that response has the expected fields
    expect(body).toHaveProperty('price');
    expect(body).toHaveProperty('tokenIn');
    expect(body).toHaveProperty('tokenOut');
  });

  it('should return a price quote for BUY side', async () => {
    const mockEthereumInstance = {
      chainId: 1,
      provider: {},
      getTokenBySymbol: jest
        .fn()
        .mockReturnValueOnce(mockWETH)
        .mockReturnValueOnce(mockUSDC),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);

    const mockUniswapInstance = {};
    (Uniswap.getInstance as jest.Mock).mockResolvedValue(mockUniswapInstance);

    // Mock AlphaRouter for BUY side
    const mockBuyResponse = {
      quote: {
        toExact: () => '0.0667', // 100 USDC buys 0.0667 WETH
      },
      route: [
        {
          tokenPath: [
            new Token(1, mockUSDC.address, 6, 'USDC', 'USD Coin'),
            new Token(1, mockWETH.address, 18, 'WETH', 'Wrapped Ether'),
          ],
          protocol: 'V3',
        },
      ],
    };

    const { AlphaRouter } = require('@uniswap/smart-order-router');
    AlphaRouter.mockImplementation(() => ({
      route: jest.fn().mockResolvedValue(mockBuyResponse),
    }));

    const response = await server.inject({
      method: 'GET',
      url: '/get-price',
      query: {
        network: 'mainnet',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: '100',
        side: 'BUY',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('estimatedAmountIn', 0.0667);
    expect(body).toHaveProperty('estimatedAmountOut', 100);
    expect(body).toHaveProperty('tokenIn', mockUSDC.address);
    expect(body).toHaveProperty('tokenOut', mockWETH.address);
  });

  it('should return 400 if token not found', async () => {
    const mockEthereumInstance = {
      getTokenBySymbol: jest
        .fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(mockUSDC),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/get-price',
      query: {
        network: 'mainnet',
        baseToken: 'INVALID',
        quoteToken: 'USDC',
        amount: '1',
        side: 'SELL',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });

  it('should return 404 if no routes found', async () => {
    const mockEthereumInstance = {
      chainId: 1,
      provider: {},
      getTokenBySymbol: jest
        .fn()
        .mockReturnValueOnce(mockWETH)
        .mockReturnValueOnce(mockUSDC),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);

    const mockUniswapInstance = {};
    (Uniswap.getInstance as jest.Mock).mockResolvedValue(mockUniswapInstance);

    // Mock AlphaRouter to return null
    const { AlphaRouter } = require('@uniswap/smart-order-router');
    AlphaRouter.mockImplementation(() => ({
      route: jest.fn().mockResolvedValue(null),
    }));

    const response = await server.inject({
      method: 'GET',
      url: '/get-price',
      query: {
        network: 'mainnet',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: '1',
        side: 'SELL',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });
});

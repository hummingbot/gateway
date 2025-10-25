import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { getEthereumQuoteSwap } from '../../../../src/chains/ethereum/routes/quote-swap';

// Mock getEthereumNetworkConfig
jest.mock('../../../../src/chains/ethereum/ethereum.config', () => ({
  ...jest.requireActual('../../../../src/chains/ethereum/ethereum.config'),
  getEthereumNetworkConfig: jest.fn(),
}));

const { getEthereumNetworkConfig } = require('../../../../src/chains/ethereum/ethereum.config');

// Mock connector quoteSwap functions
jest.mock('../../../../src/connectors/uniswap/router-routes/quoteSwap', () => ({
  quoteSwap: jest.fn(),
}));

jest.mock('../../../../src/connectors/pancakeswap/router-routes/quoteSwap', () => ({
  quoteSwap: jest.fn(),
}));

jest.mock('../../../../src/connectors/0x/router-routes/quoteSwap', () => ({
  quoteSwap: jest.fn(),
}));

describe('Ethereum Quote Swap Route', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getEthereumQuoteSwap function', () => {
    const mockQuoteResponse = {
      quoteId: 'quote-123',
      baseToken: 'ETH',
      quoteToken: 'USDC',
      side: 'BUY' as const,
      baseAmount: 1,
      quoteAmount: 3000,
      price: 3000,
      fee: 0.003,
      gasEstimate: 150000,
    };

    it('should route to uniswap when swapProvider is uniswap/router', async () => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        swapProvider: 'uniswap/router',
      });

      const { quoteSwap: mockUniswapQuoteSwap } = require('../../../../src/connectors/uniswap/router-routes/quoteSwap');
      mockUniswapQuoteSwap.mockResolvedValue(mockQuoteResponse);

      const result = await getEthereumQuoteSwap(fastify, 'mainnet', 'ETH', 'USDC', 1, 'BUY', 1, '0x123');

      expect(result).toEqual(mockQuoteResponse);
      expect(mockUniswapQuoteSwap).toHaveBeenCalledWith(fastify, 'mainnet', '0x123', 'ETH', 'USDC', 1, 'BUY', 1);
    });

    it('should route to pancakeswap when swapProvider is pancakeswap/router', async () => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'bsc',
        defaultWallet: 'test-wallet',
        swapProvider: 'pancakeswap/router',
      });

      const {
        quoteSwap: mockPancakeswapQuoteSwap,
      } = require('../../../../src/connectors/pancakeswap/router-routes/quoteSwap');
      mockPancakeswapQuoteSwap.mockResolvedValue(mockQuoteResponse);

      const result = await getEthereumQuoteSwap(fastify, 'bsc', 'BNB', 'BUSD', 1, 'SELL', 1, '0x456');

      expect(result).toEqual(mockQuoteResponse);
      expect(mockPancakeswapQuoteSwap).toHaveBeenCalledWith(fastify, 'bsc', '0x456', 'BNB', 'BUSD', 1, 'SELL', 1);
    });

    it('should route to 0x when swapProvider is 0x/router', async () => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        swapProvider: '0x/router',
      });

      const { quoteSwap: mock0xQuoteSwap } = require('../../../../src/connectors/0x/router-routes/quoteSwap');
      mock0xQuoteSwap.mockResolvedValue(mockQuoteResponse);

      const result = await getEthereumQuoteSwap(fastify, 'mainnet', 'ETH', 'DAI', 1, 'BUY', 2, '0x789');

      expect(result).toEqual(mockQuoteResponse);
      expect(mock0xQuoteSwap).toHaveBeenCalled();
    });

    it('should default to uniswap/router when swapProvider is not set', async () => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        // swapProvider is undefined
      });

      const { quoteSwap: mockUniswapQuoteSwap } = require('../../../../src/connectors/uniswap/router-routes/quoteSwap');
      mockUniswapQuoteSwap.mockResolvedValue(mockQuoteResponse);

      const result = await getEthereumQuoteSwap(fastify, 'mainnet', 'ETH', 'USDC', 1, 'BUY', 1, '0x123');

      expect(result).toEqual(mockQuoteResponse);
      expect(mockUniswapQuoteSwap).toHaveBeenCalled();
    });

    it('should handle unsupported swap provider', async () => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        swapProvider: 'unsupported/provider',
      });

      await expect(getEthereumQuoteSwap(fastify, 'mainnet', 'ETH', 'USDC', 1, 'BUY', 1, '0x123')).rejects.toThrow();
    });

    it('should handle connector errors', async () => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        swapProvider: 'uniswap/router',
      });

      const { quoteSwap: mockUniswapQuoteSwap } = require('../../../../src/connectors/uniswap/router-routes/quoteSwap');
      mockUniswapQuoteSwap.mockRejectedValue(new Error('Insufficient liquidity'));

      await expect(getEthereumQuoteSwap(fastify, 'mainnet', 'ETH', 'USDC', 1, 'BUY', 1, '0x123')).rejects.toThrow();
    });
  });

  describe('POST /chains/ethereum/quote-swap', () => {
    const mockQuoteResponse = {
      quoteId: 'quote-123',
      baseToken: 'ETH',
      quoteToken: 'USDC',
      side: 'BUY' as const,
      baseAmount: 1,
      quoteAmount: 3000,
      price: 3000,
      fee: 0.003,
      gasEstimate: 150000,
    };

    beforeEach(() => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        swapProvider: 'uniswap/router',
      });
    });

    it('should return quote response successfully', async () => {
      const { quoteSwap: mockUniswapQuoteSwap } = require('../../../../src/connectors/uniswap/router-routes/quoteSwap');
      mockUniswapQuoteSwap.mockResolvedValue(mockQuoteResponse);

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/ethereum/quote-swap?network=mainnet&walletAddress=0x123&baseToken=ETH&quoteToken=USDC&amount=1&side=BUY&slippagePct=1',
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual(mockQuoteResponse);
    });

    it('should handle missing optional parameters', async () => {
      const { quoteSwap: mockUniswapQuoteSwap } = require('../../../../src/connectors/uniswap/router-routes/quoteSwap');
      mockUniswapQuoteSwap.mockResolvedValue(mockQuoteResponse);

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/ethereum/quote-swap?baseToken=ETH&quoteToken=USDC&amount=1&side=SELL',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return error on invalid request', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/ethereum/quote-swap',
        // Missing required query parameters
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

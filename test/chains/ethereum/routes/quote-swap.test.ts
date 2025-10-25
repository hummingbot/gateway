import { FastifyInstance } from 'fastify';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { getEthereumQuoteSwap } from '../../../../src/chains/ethereum/routes/quote-swap';
import { MOCK_WALLET_ADDRESSES } from '../../../constants/mockTokens';
import { createMockEthereumQuoteResponse } from '../../../helpers/mockResponses';

// Setup common mocks
jest.mock('../../../../src/services/logger', () => require('../../../helpers/commonMocks').createLoggerMock());

// Mock the Ethereum class
jest.mock('../../../../src/chains/ethereum/ethereum');

// Mock the Solana class
jest.mock('../../../../src/chains/solana/solana');

// Mock getEthereumNetworkConfig - must come BEFORE app import
jest.mock('../../../../src/chains/ethereum/ethereum.config', () => ({
  ...jest.requireActual('../../../../src/chains/ethereum/ethereum.config'),
  getEthereumNetworkConfig: jest.fn(),
  getEthereumChainConfig: jest.fn().mockReturnValue({
    defaultNetwork: 'mainnet',
    defaultWallet: 'test-wallet',
  }),
}));

// Mock all Ethereum connector quoteSwap routes
jest.mock('../../../../src/connectors/uniswap/router-routes/quoteSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('quoteSwap'),
);
jest.mock('../../../../src/connectors/uniswap/amm-routes/quoteSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('quoteSwap'),
);
jest.mock('../../../../src/connectors/uniswap/clmm-routes/quoteSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('quoteSwap'),
);
jest.mock('../../../../src/connectors/pancakeswap/router-routes/quoteSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('quoteSwap'),
);
jest.mock('../../../../src/connectors/pancakeswap/amm-routes/quoteSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('quoteSwap'),
);
jest.mock('../../../../src/connectors/pancakeswap/clmm-routes/quoteSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('quoteSwap'),
);
jest.mock('../../../../src/connectors/0x/router-routes/quoteSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('quoteSwap'),
);

import { gatewayApp } from '../../../../src/app';

const ethereumConfig = require('../../../../src/chains/ethereum/ethereum.config');
const getEthereumNetworkConfig = ethereumConfig.getEthereumNetworkConfig as jest.Mock;

describe('Ethereum Quote Swap Route', () => {
  let fastify: FastifyInstance;

  // Define mock response once at describe level (no duplication)
  const mockQuoteResponse = createMockEthereumQuoteResponse();

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
    it('should route to uniswap when swapProvider is uniswap/router', async () => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        swapProvider: 'uniswap/router',
      });

      const { quoteSwap: mockUniswapQuoteSwap } = require('../../../../src/connectors/uniswap/router-routes/quoteSwap');
      mockUniswapQuoteSwap.mockResolvedValue(mockQuoteResponse);

      const result = await getEthereumQuoteSwap(
        fastify,
        'mainnet',
        'ETH',
        'USDC',
        1,
        'BUY',
        1,
        MOCK_WALLET_ADDRESSES.ETHEREUM,
      );

      expect(result).toEqual(mockQuoteResponse);
      expect(mockUniswapQuoteSwap).toHaveBeenCalledWith(
        fastify,
        'mainnet',
        MOCK_WALLET_ADDRESSES.ETHEREUM,
        'ETH',
        'USDC',
        1,
        'BUY',
        1,
      );
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

      const result = await getEthereumQuoteSwap(
        fastify,
        'bsc',
        'BNB',
        'BUSD',
        1,
        'SELL',
        1,
        MOCK_WALLET_ADDRESSES.ETHEREUM,
      );

      expect(result).toEqual(mockQuoteResponse);
      expect(mockPancakeswapQuoteSwap).toHaveBeenCalledWith(
        fastify,
        'bsc',
        MOCK_WALLET_ADDRESSES.ETHEREUM,
        'BNB',
        'BUSD',
        1,
        'SELL',
        1,
      );
    });

    it('should route to 0x when swapProvider is 0x/router', async () => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        swapProvider: '0x/router',
      });

      const { quoteSwap: mock0xQuoteSwap } = require('../../../../src/connectors/0x/router-routes/quoteSwap');
      mock0xQuoteSwap.mockResolvedValue(mockQuoteResponse);

      const result = await getEthereumQuoteSwap(
        fastify,
        'mainnet',
        'ETH',
        'DAI',
        1,
        'BUY',
        2,
        MOCK_WALLET_ADDRESSES.ETHEREUM,
      );

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

      const result = await getEthereumQuoteSwap(
        fastify,
        'mainnet',
        'ETH',
        'USDC',
        1,
        'BUY',
        1,
        MOCK_WALLET_ADDRESSES.ETHEREUM,
      );

      expect(result).toEqual(mockQuoteResponse);
      expect(mockUniswapQuoteSwap).toHaveBeenCalled();
    });

    it('should handle unsupported swap provider', async () => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        swapProvider: 'unsupported/provider',
      });

      await expect(
        getEthereumQuoteSwap(fastify, 'mainnet', 'ETH', 'USDC', 1, 'BUY', 1, MOCK_WALLET_ADDRESSES.ETHEREUM),
      ).rejects.toThrow();
    });

    it('should handle connector errors', async () => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        swapProvider: 'uniswap/router',
      });

      const { quoteSwap: mockUniswapQuoteSwap } = require('../../../../src/connectors/uniswap/router-routes/quoteSwap');
      mockUniswapQuoteSwap.mockRejectedValue(new Error('Insufficient liquidity'));

      await expect(
        getEthereumQuoteSwap(fastify, 'mainnet', 'ETH', 'USDC', 1, 'BUY', 1, MOCK_WALLET_ADDRESSES.ETHEREUM),
      ).rejects.toThrow();
    });
  });

  describe('POST /chains/ethereum/quote-swap', () => {
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
        url: `/chains/ethereum/quote-swap?network=mainnet&walletAddress=${MOCK_WALLET_ADDRESSES.ETHEREUM}&baseToken=ETH&quoteToken=USDC&amount=1&side=BUY&slippagePct=1`,
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

import { FastifyInstance } from 'fastify';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { executeEthereumSwap } from '../../../../src/chains/ethereum/routes/execute-swap';
import { MOCK_WALLET_ADDRESSES } from '../../../constants/mockTokens';
import { createMockEthereumExecuteResponse } from '../../../helpers/mockResponses';

// Setup common mocks
jest.mock('../../../../src/services/logger', () => require('../../../helpers/commonMocks').createLoggerMock());
jest.mock('../../../../src/services/config-manager-v2', () =>
  require('../../../helpers/commonMocks').createConfigManagerMock(),
);

// Mock the Ethereum class
jest.mock('../../../../src/chains/ethereum/ethereum');

// Mock getEthereumNetworkConfig - must come BEFORE app import
jest.mock('../../../../src/chains/ethereum/ethereum.config', () => ({
  ...jest.requireActual('../../../../src/chains/ethereum/ethereum.config'),
  getEthereumNetworkConfig: jest.fn(),
  getEthereumChainConfig: jest.fn().mockReturnValue({
    defaultNetwork: 'mainnet',
    defaultWallet: 'test-wallet',
  }),
}));

// Mock all Ethereum connector executeSwap routes
jest.mock('../../../../src/connectors/uniswap/router-routes/executeSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('executeSwap'),
);
jest.mock('../../../../src/connectors/uniswap/amm-routes/executeSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('executeSwap'),
);
jest.mock('../../../../src/connectors/uniswap/clmm-routes/executeSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('executeSwap'),
);
jest.mock('../../../../src/connectors/pancakeswap/router-routes/executeSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('executeSwap'),
);
jest.mock('../../../../src/connectors/pancakeswap/amm-routes/executeSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('executeSwap'),
);
jest.mock('../../../../src/connectors/pancakeswap/clmm-routes/executeSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('executeSwap'),
);
jest.mock('../../../../src/connectors/0x/router-routes/executeSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('executeSwap'),
);

import { gatewayApp } from '../../../../src/app';

const ethereumConfig = require('../../../../src/chains/ethereum/ethereum.config');
const getEthereumNetworkConfig = ethereumConfig.getEthereumNetworkConfig as jest.Mock;

describe('Ethereum Execute Swap Route', () => {
  let fastify: FastifyInstance;

  // Define mock response once at describe level (no duplication)
  const mockExecuteResponse = createMockEthereumExecuteResponse();

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

  describe('executeEthereumSwap function', () => {
    it('should route to uniswap when swapProvider is uniswap/router', async () => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        swapProvider: 'uniswap/router',
      });

      const {
        executeSwap: mockUniswapExecuteSwap,
      } = require('../../../../src/connectors/uniswap/router-routes/executeSwap');
      mockUniswapExecuteSwap.mockResolvedValue(mockExecuteResponse);

      const result = await executeEthereumSwap(
        fastify,
        'mainnet',
        MOCK_WALLET_ADDRESSES.ETHEREUM,
        'ETH',
        'USDC',
        1,
        'BUY',
        1,
      );

      expect(result).toEqual(mockExecuteResponse);
      expect(mockUniswapExecuteSwap).toHaveBeenCalledWith(
        fastify,
        MOCK_WALLET_ADDRESSES.ETHEREUM,
        'mainnet',
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
        executeSwap: mockPancakeswapExecuteSwap,
      } = require('../../../../src/connectors/pancakeswap/router-routes/executeSwap');
      mockPancakeswapExecuteSwap.mockResolvedValue(mockExecuteResponse);

      const result = await executeEthereumSwap(
        fastify,
        'bsc',
        MOCK_WALLET_ADDRESSES.ETHEREUM,
        'BNB',
        'BUSD',
        1,
        'SELL',
        1,
      );

      expect(result).toEqual(mockExecuteResponse);
      expect(mockPancakeswapExecuteSwap).toHaveBeenCalledWith(
        fastify,
        MOCK_WALLET_ADDRESSES.ETHEREUM,
        'bsc',
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

      const { executeSwap: mock0xExecuteSwap } = require('../../../../src/connectors/0x/router-routes/executeSwap');
      mock0xExecuteSwap.mockResolvedValue(mockExecuteResponse);

      const result = await executeEthereumSwap(
        fastify,
        'mainnet',
        MOCK_WALLET_ADDRESSES.ETHEREUM,
        'ETH',
        'DAI',
        1,
        'BUY',
        2,
      );

      expect(result).toEqual(mockExecuteResponse);
      expect(mock0xExecuteSwap).toHaveBeenCalled();
    });

    it('should default to uniswap/router when swapProvider is not set', async () => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        // swapProvider is undefined
      });

      const {
        executeSwap: mockUniswapExecuteSwap,
      } = require('../../../../src/connectors/uniswap/router-routes/executeSwap');
      mockUniswapExecuteSwap.mockResolvedValue(mockExecuteResponse);

      const result = await executeEthereumSwap(
        fastify,
        'mainnet',
        MOCK_WALLET_ADDRESSES.ETHEREUM,
        'ETH',
        'USDC',
        1,
        'BUY',
        1,
      );

      expect(result).toEqual(mockExecuteResponse);
      expect(mockUniswapExecuteSwap).toHaveBeenCalled();
    });

    it('should handle unsupported swap provider', async () => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        swapProvider: 'unsupported/provider',
      });

      await expect(
        executeEthereumSwap(fastify, 'mainnet', MOCK_WALLET_ADDRESSES.ETHEREUM, 'ETH', 'USDC', 1, 'BUY', 1),
      ).rejects.toThrow();
    });

    it('should handle connector errors', async () => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        swapProvider: 'uniswap/router',
      });

      const {
        executeSwap: mockUniswapExecuteSwap,
      } = require('../../../../src/connectors/uniswap/router-routes/executeSwap');
      mockUniswapExecuteSwap.mockRejectedValue(new Error('Transaction failed'));

      await expect(
        executeEthereumSwap(fastify, 'mainnet', MOCK_WALLET_ADDRESSES.ETHEREUM, 'ETH', 'USDC', 1, 'BUY', 1),
      ).rejects.toThrow();
    });
  });

  describe('POST /chains/ethereum/execute-swap', () => {
    beforeEach(() => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        swapProvider: 'uniswap/router',
      });
    });

    it('should return execute response successfully', async () => {
      const {
        executeSwap: mockUniswapExecuteSwap,
      } = require('../../../../src/connectors/uniswap/router-routes/executeSwap');
      mockUniswapExecuteSwap.mockResolvedValue(mockExecuteResponse);

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/ethereum/execute-swap',
        payload: {
          network: 'mainnet',
          walletAddress: MOCK_WALLET_ADDRESSES.ETHEREUM,
          baseToken: 'ETH',
          quoteToken: 'USDC',
          amount: 1,
          side: 'BUY',
          slippagePct: 1,
        },
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual(mockExecuteResponse);
    });

    it('should handle missing optional parameters', async () => {
      const {
        executeSwap: mockUniswapExecuteSwap,
      } = require('../../../../src/connectors/uniswap/router-routes/executeSwap');
      mockUniswapExecuteSwap.mockResolvedValue(mockExecuteResponse);

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/ethereum/execute-swap',
        payload: {
          walletAddress: MOCK_WALLET_ADDRESSES.ETHEREUM,
          baseToken: 'ETH',
          quoteToken: 'USDC',
          amount: 1,
          side: 'SELL',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return error on invalid request', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/ethereum/execute-swap',
        payload: {
          // Missing required fields
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

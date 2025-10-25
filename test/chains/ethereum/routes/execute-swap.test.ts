import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { executeEthereumSwap } from '../../../../src/chains/ethereum/routes/execute-swap';

// Mock getEthereumNetworkConfig
jest.mock('../../../../src/chains/ethereum/ethereum.config', () => ({
  ...jest.requireActual('../../../../src/chains/ethereum/ethereum.config'),
  getEthereumNetworkConfig: jest.fn(),
}));

const { getEthereumNetworkConfig } = require('../../../../src/chains/ethereum/ethereum.config');

// Mock connector executeSwap functions
jest.mock('../../../../src/connectors/uniswap/router-routes/executeSwap', () => ({
  executeSwap: jest.fn(),
}));

jest.mock('../../../../src/connectors/pancakeswap/router-routes/executeSwap', () => ({
  executeSwap: jest.fn(),
}));

jest.mock('../../../../src/connectors/0x/router-routes/executeSwap', () => ({
  executeSwap: jest.fn(),
}));

describe('Ethereum Execute Swap Route', () => {
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

  describe('executeEthereumSwap function', () => {
    const mockExecuteResponse = {
      signature: '0xabc123',
      status: 1,
      data: {
        baseToken: 'ETH',
        quoteToken: 'USDC',
        side: 'BUY' as const,
        baseAmount: 1,
        quoteAmount: 3000,
        price: 3000,
        fee: '0.01',
        nonce: 42,
      },
    };

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

      const result = await executeEthereumSwap(fastify, 'mainnet', '0x123', 'ETH', 'USDC', 1, 'BUY', 1);

      expect(result).toEqual(mockExecuteResponse);
      expect(mockUniswapExecuteSwap).toHaveBeenCalledWith(fastify, 'mainnet', '0x123', 'ETH', 'USDC', 1, 'BUY', 1);
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

      const result = await executeEthereumSwap(fastify, 'bsc', '0x456', 'BNB', 'BUSD', 1, 'SELL', 1);

      expect(result).toEqual(mockExecuteResponse);
      expect(mockPancakeswapExecuteSwap).toHaveBeenCalledWith(fastify, 'bsc', '0x456', 'BNB', 'BUSD', 1, 'SELL', 1);
    });

    it('should route to 0x when swapProvider is 0x/router', async () => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        swapProvider: '0x/router',
      });

      const { executeSwap: mock0xExecuteSwap } = require('../../../../src/connectors/0x/router-routes/executeSwap');
      mock0xExecuteSwap.mockResolvedValue(mockExecuteResponse);

      const result = await executeEthereumSwap(fastify, 'mainnet', '0x789', 'ETH', 'DAI', 1, 'BUY', 2);

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

      const result = await executeEthereumSwap(fastify, 'mainnet', '0x123', 'ETH', 'USDC', 1, 'BUY', 1);

      expect(result).toEqual(mockExecuteResponse);
      expect(mockUniswapExecuteSwap).toHaveBeenCalled();
    });

    it('should handle unsupported swap provider', async () => {
      getEthereumNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        swapProvider: 'unsupported/provider',
      });

      await expect(executeEthereumSwap(fastify, 'mainnet', '0x123', 'ETH', 'USDC', 1, 'BUY', 1)).rejects.toThrow();
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

      await expect(executeEthereumSwap(fastify, 'mainnet', '0x123', 'ETH', 'USDC', 1, 'BUY', 1)).rejects.toThrow();
    });
  });

  describe('POST /chains/ethereum/execute-swap', () => {
    const mockExecuteResponse = {
      signature: '0xabc123',
      status: 1,
      data: {
        baseToken: 'ETH',
        quoteToken: 'USDC',
        side: 'BUY' as const,
        baseAmount: 1,
        quoteAmount: 3000,
        price: 3000,
        fee: '0.01',
        nonce: 42,
      },
    };

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
          walletAddress: '0x123',
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
          walletAddress: '0x123',
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

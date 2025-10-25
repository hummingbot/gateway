import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { executeSolanaSwap } from '../../../../src/chains/solana/routes/execute-swap';

// Mock getSolanaNetworkConfig
jest.mock('../../../../src/chains/solana/solana.config', () => ({
  ...jest.requireActual('../../../../src/chains/solana/solana.config'),
  getSolanaNetworkConfig: jest.fn(),
}));

const { getSolanaNetworkConfig } = require('../../../../src/chains/solana/solana.config');

// Mock Jupiter executeSwap function
jest.mock('../../../../src/connectors/jupiter/router-routes/executeSwap', () => ({
  executeSwap: jest.fn(),
}));

describe('Solana Execute Swap Route', () => {
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

  describe('executeSolanaSwap function', () => {
    const mockExecuteResponse = {
      signature: '5ZxW8vK2...',
      status: 1,
      data: {
        baseToken: 'SOL',
        quoteToken: 'USDC',
        side: 'BUY' as const,
        baseAmount: 1,
        quoteAmount: 150,
        price: 150,
        fee: '0.000005',
        nonce: 0,
      },
    };

    it('should route to jupiter when swapProvider is jupiter/router', async () => {
      getSolanaNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet-beta',
        defaultWallet: 'test-wallet',
        swapProvider: 'jupiter/router',
      });

      const {
        executeSwap: mockJupiterExecuteSwap,
      } = require('../../../../src/connectors/jupiter/router-routes/executeSwap');
      mockJupiterExecuteSwap.mockResolvedValue(mockExecuteResponse);

      const result = await executeSolanaSwap(
        fastify,
        'mainnet-beta',
        'SolWalletAddress123',
        'SOL',
        'USDC',
        1,
        'BUY',
        1,
      );

      expect(result).toEqual(mockExecuteResponse);
      expect(mockJupiterExecuteSwap).toHaveBeenCalledWith(
        fastify,
        'mainnet-beta',
        'SolWalletAddress123',
        'SOL',
        'USDC',
        1,
        'BUY',
        1,
        undefined,
        undefined,
      );
    });

    it('should default to jupiter/router when swapProvider is not set', async () => {
      getSolanaNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet-beta',
        defaultWallet: 'test-wallet',
        // swapProvider is undefined
      });

      const {
        executeSwap: mockJupiterExecuteSwap,
      } = require('../../../../src/connectors/jupiter/router-routes/executeSwap');
      mockJupiterExecuteSwap.mockResolvedValue(mockExecuteResponse);

      const result = await executeSolanaSwap(
        fastify,
        'mainnet-beta',
        'SolWalletAddress123',
        'SOL',
        'USDC',
        1,
        'BUY',
        1,
      );

      expect(result).toEqual(mockExecuteResponse);
      expect(mockJupiterExecuteSwap).toHaveBeenCalled();
    });

    it('should handle unsupported swap provider', async () => {
      getSolanaNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet-beta',
        defaultWallet: 'test-wallet',
        swapProvider: 'unsupported/provider',
      });

      await expect(
        executeSolanaSwap(fastify, 'mainnet-beta', 'SolWalletAddress123', 'SOL', 'USDC', 1, 'BUY', 1),
      ).rejects.toThrow();
    });

    it('should handle connector errors', async () => {
      getSolanaNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet-beta',
        defaultWallet: 'test-wallet',
        swapProvider: 'jupiter/router',
      });

      const {
        executeSwap: mockJupiterExecuteSwap,
      } = require('../../../../src/connectors/jupiter/router-routes/executeSwap');
      mockJupiterExecuteSwap.mockRejectedValue(new Error('Transaction failed'));

      await expect(
        executeSolanaSwap(fastify, 'mainnet-beta', 'SolWalletAddress123', 'SOL', 'USDC', 1, 'BUY', 1),
      ).rejects.toThrow();
    });

    it('should work with devnet network', async () => {
      getSolanaNetworkConfig.mockReturnValue({
        defaultNetwork: 'devnet',
        defaultWallet: 'test-wallet',
        swapProvider: 'jupiter/router',
      });

      const {
        executeSwap: mockJupiterExecuteSwap,
      } = require('../../../../src/connectors/jupiter/router-routes/executeSwap');
      mockJupiterExecuteSwap.mockResolvedValue(mockExecuteResponse);

      const result = await executeSolanaSwap(fastify, 'devnet', 'SolWalletAddress456', 'SOL', 'USDC', 1, 'SELL', 2);

      expect(result).toEqual(mockExecuteResponse);
      expect(mockJupiterExecuteSwap).toHaveBeenCalledWith(
        fastify,
        'devnet',
        'SolWalletAddress456',
        'SOL',
        'USDC',
        1,
        'SELL',
        2,
        undefined,
        undefined,
      );
    });
  });

  describe('POST /chains/solana/execute-swap', () => {
    const mockExecuteResponse = {
      signature: '5ZxW8vK2...',
      status: 1,
      data: {
        baseToken: 'SOL',
        quoteToken: 'USDC',
        side: 'BUY' as const,
        baseAmount: 1,
        quoteAmount: 150,
        price: 150,
        fee: '0.000005',
        nonce: 0,
      },
    };

    beforeEach(() => {
      getSolanaNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet-beta',
        defaultWallet: 'test-wallet',
        swapProvider: 'jupiter/router',
      });
    });

    it('should return execute response successfully', async () => {
      const {
        executeSwap: mockJupiterExecuteSwap,
      } = require('../../../../src/connectors/jupiter/router-routes/executeSwap');
      mockJupiterExecuteSwap.mockResolvedValue(mockExecuteResponse);

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/execute-swap',
        payload: {
          network: 'mainnet-beta',
          walletAddress: 'SolWalletAddress123',
          baseToken: 'SOL',
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
        executeSwap: mockJupiterExecuteSwap,
      } = require('../../../../src/connectors/jupiter/router-routes/executeSwap');
      mockJupiterExecuteSwap.mockResolvedValue(mockExecuteResponse);

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/execute-swap',
        payload: {
          walletAddress: 'SolWalletAddress123',
          baseToken: 'SOL',
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
        url: '/chains/solana/execute-swap',
        payload: {
          // Missing required fields
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

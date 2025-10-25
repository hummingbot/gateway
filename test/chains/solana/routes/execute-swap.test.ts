import { FastifyInstance } from 'fastify';

import { executeSolanaSwap } from '../../../../src/chains/solana/routes/execute-swap';
import { Solana } from '../../../../src/chains/solana/solana';
import { MOCK_WALLET_ADDRESSES } from '../../../constants/mockTokens';
import { createMockSolanaExecuteResponse } from '../../../helpers/mockResponses';

// Setup common mocks
jest.mock('../../../../src/services/logger', () => require('../../../helpers/commonMocks').createLoggerMock());
jest.mock('../../../../src/services/config-manager-v2', () =>
  require('../../../helpers/commonMocks').createConfigManagerMock(),
);

// Mock the Solana class
jest.mock('../../../../src/chains/solana/solana');

// Mock getSolanaNetworkConfig - must come BEFORE app import
jest.mock('../../../../src/chains/solana/solana.config', () => ({
  ...jest.requireActual('../../../../src/chains/solana/solana.config'),
  getSolanaNetworkConfig: jest.fn(),
  getSolanaChainConfig: jest.fn().mockReturnValue({
    defaultNetwork: 'mainnet-beta',
    defaultWallet: 'test-wallet',
  }),
}));

// Mock all Solana connector executeSwap routes
jest.mock('../../../../src/connectors/jupiter/router-routes/executeSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('executeSwap'),
);
jest.mock('../../../../src/connectors/raydium/amm-routes/executeSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('executeSwap', true),
);
jest.mock('../../../../src/connectors/raydium/clmm-routes/executeSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('executeSwap', true),
);
jest.mock('../../../../src/connectors/meteora/clmm-routes/executeSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('executeSwap', true),
);
jest.mock('../../../../src/connectors/pancakeswap-sol/clmm-routes/executeSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('executeSwap', true),
);

import { gatewayApp } from '../../../../src/app';

const solanaConfig = require('../../../../src/chains/solana/solana.config');
const getSolanaNetworkConfig = solanaConfig.getSolanaNetworkConfig as jest.Mock;

describe('Solana Execute Swap Route', () => {
  let fastify: FastifyInstance;

  // Define mock response once at describe level (no duplication)
  const mockExecuteResponse = createMockSolanaExecuteResponse();

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
        MOCK_WALLET_ADDRESSES.SOLANA,
        'SOL',
        'USDC',
        1,
        'BUY',
        1,
      );

      expect(result).toEqual(mockExecuteResponse);
      expect(mockJupiterExecuteSwap).toHaveBeenCalledWith(
        fastify,
        MOCK_WALLET_ADDRESSES.SOLANA,
        'mainnet-beta',
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
        MOCK_WALLET_ADDRESSES.SOLANA,
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
        executeSolanaSwap(fastify, 'mainnet-beta', MOCK_WALLET_ADDRESSES.SOLANA, 'SOL', 'USDC', 1, 'BUY', 1),
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
        executeSolanaSwap(fastify, 'mainnet-beta', MOCK_WALLET_ADDRESSES.SOLANA, 'SOL', 'USDC', 1, 'BUY', 1),
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

      const result = await executeSolanaSwap(
        fastify,
        'devnet',
        MOCK_WALLET_ADDRESSES.SOLANA,
        'SOL',
        'USDC',
        1,
        'SELL',
        2,
      );

      expect(result).toEqual(mockExecuteResponse);
      expect(mockJupiterExecuteSwap).toHaveBeenCalledWith(
        fastify,
        MOCK_WALLET_ADDRESSES.SOLANA,
        'devnet',
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
          walletAddress: MOCK_WALLET_ADDRESSES.SOLANA,
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
          walletAddress: MOCK_WALLET_ADDRESSES.SOLANA,
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

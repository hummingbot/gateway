import { FastifyInstance } from 'fastify';

import { getSolanaQuoteSwap } from '../../../../src/chains/solana/routes/quote-swap';
import { Solana } from '../../../../src/chains/solana/solana';
import { MOCK_WALLET_ADDRESSES } from '../../../constants/mockTokens';
import { createMockSolanaQuoteResponse } from '../../../helpers/mockResponses';

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

// Mock all Solana connector quoteSwap routes
jest.mock('../../../../src/connectors/jupiter/router-routes/quoteSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('quoteSwap'),
);
jest.mock('../../../../src/connectors/raydium/amm-routes/quoteSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('quoteSwap', true),
);
jest.mock('../../../../src/connectors/raydium/clmm-routes/quoteSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('quoteSwap', true),
);
jest.mock('../../../../src/connectors/meteora/clmm-routes/quoteSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('quoteSwap', true),
);
jest.mock('../../../../src/connectors/pancakeswap-sol/clmm-routes/quoteSwap', () =>
  require('../../../helpers/connectorMocks').createRouteMock('quoteSwap', true),
);

import { gatewayApp } from '../../../../src/app';

const solanaConfig = require('../../../../src/chains/solana/solana.config');
const getSolanaNetworkConfig = solanaConfig.getSolanaNetworkConfig as jest.Mock;

describe('Solana Quote Swap Route', () => {
  let fastify: FastifyInstance;

  // Define mock response once at describe level (no duplication)
  const mockQuoteResponse = createMockSolanaQuoteResponse();

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

  describe('getSolanaQuoteSwap function', () => {
    it('should route to jupiter when swapProvider is jupiter/router', async () => {
      getSolanaNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet-beta',
        defaultWallet: 'test-wallet',
        swapProvider: 'jupiter/router',
      });

      const { quoteSwap: mockJupiterQuoteSwap } = require('../../../../src/connectors/jupiter/router-routes/quoteSwap');
      mockJupiterQuoteSwap.mockResolvedValue(mockQuoteResponse);

      const result = await getSolanaQuoteSwap(fastify, 'mainnet-beta', 'SOL', 'USDC', 1, 'BUY', 1);

      expect(result).toEqual(mockQuoteResponse);
      expect(mockJupiterQuoteSwap).toHaveBeenCalledWith(
        fastify,
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

      const { quoteSwap: mockJupiterQuoteSwap } = require('../../../../src/connectors/jupiter/router-routes/quoteSwap');
      mockJupiterQuoteSwap.mockResolvedValue(mockQuoteResponse);

      const result = await getSolanaQuoteSwap(fastify, 'mainnet-beta', 'SOL', 'USDC', 1, 'BUY', 1);

      expect(result).toEqual(mockQuoteResponse);
      expect(mockJupiterQuoteSwap).toHaveBeenCalled();
    });

    it('should handle unsupported swap provider', async () => {
      getSolanaNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet-beta',
        defaultWallet: 'test-wallet',
        swapProvider: 'unsupported/provider',
      });

      await expect(getSolanaQuoteSwap(fastify, 'mainnet-beta', 'SOL', 'USDC', 1, 'BUY', 1)).rejects.toThrow();
    });

    it('should handle connector errors', async () => {
      getSolanaNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet-beta',
        defaultWallet: 'test-wallet',
        swapProvider: 'jupiter/router',
      });

      const { quoteSwap: mockJupiterQuoteSwap } = require('../../../../src/connectors/jupiter/router-routes/quoteSwap');
      mockJupiterQuoteSwap.mockRejectedValue(new Error('No routes found'));

      await expect(getSolanaQuoteSwap(fastify, 'mainnet-beta', 'SOL', 'USDC', 1, 'BUY', 1)).rejects.toThrow();
    });

    it('should work with devnet network', async () => {
      getSolanaNetworkConfig.mockReturnValue({
        defaultNetwork: 'devnet',
        defaultWallet: 'test-wallet',
        swapProvider: 'jupiter/router',
      });

      const { quoteSwap: mockJupiterQuoteSwap } = require('../../../../src/connectors/jupiter/router-routes/quoteSwap');
      mockJupiterQuoteSwap.mockResolvedValue(mockQuoteResponse);

      const result = await getSolanaQuoteSwap(fastify, 'devnet', 'SOL', 'USDC', 1, 'SELL', 2);

      expect(result).toEqual(mockQuoteResponse);
      expect(mockJupiterQuoteSwap).toHaveBeenCalledWith(
        fastify,
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

  describe('POST /chains/solana/quote-swap', () => {
    beforeEach(() => {
      getSolanaNetworkConfig.mockReturnValue({
        defaultNetwork: 'mainnet-beta',
        defaultWallet: 'test-wallet',
        swapProvider: 'jupiter/router',
      });
    });

    it('should return quote response successfully', async () => {
      const { quoteSwap: mockJupiterQuoteSwap } = require('../../../../src/connectors/jupiter/router-routes/quoteSwap');
      mockJupiterQuoteSwap.mockResolvedValue(mockQuoteResponse);

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/solana/quote-swap?network=mainnet-beta&baseToken=SOL&quoteToken=USDC&amount=1&side=BUY&slippagePct=1',
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual(mockQuoteResponse);
    });

    it('should handle missing optional parameters', async () => {
      const { quoteSwap: mockJupiterQuoteSwap } = require('../../../../src/connectors/jupiter/router-routes/quoteSwap');
      mockJupiterQuoteSwap.mockResolvedValue(mockQuoteResponse);

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/solana/quote-swap?baseToken=SOL&quoteToken=USDC&amount=1&side=SELL',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return error on invalid request', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/solana/quote-swap',
        // Missing required query parameters
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { getSolanaQuoteSwap } from '../../../../src/chains/solana/routes/quote-swap';

// Mock getSolanaNetworkConfig
jest.mock('../../../../src/chains/solana/solana.config', () => ({
  ...jest.requireActual('../../../../src/chains/solana/solana.config'),
  getSolanaNetworkConfig: jest.fn(),
}));

const { getSolanaNetworkConfig } = require('../../../../src/chains/solana/solana.config');

// Mock Jupiter quoteSwap function
jest.mock('../../../../src/connectors/jupiter/router-routes/quoteSwap', () => ({
  quoteSwap: jest.fn(),
}));

describe('Solana Quote Swap Route', () => {
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

  describe('getSolanaQuoteSwap function', () => {
    const mockQuoteResponse = {
      quoteId: 'quote-jupiter-123',
      baseToken: 'SOL',
      quoteToken: 'USDC',
      side: 'BUY' as const,
      baseAmount: 1,
      quoteAmount: 150,
      price: 150,
      fee: 0.0025,
      gasEstimate: 5000,
    };

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
    const mockQuoteResponse = {
      quoteId: 'quote-jupiter-123',
      baseToken: 'SOL',
      quoteToken: 'USDC',
      side: 'BUY' as const,
      baseAmount: 1,
      quoteAmount: 150,
      price: 150,
      fee: 0.0025,
      gasEstimate: 5000,
    };

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

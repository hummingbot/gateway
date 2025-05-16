import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import quoteSwapRoute from '../../../../src/connectors/spectrum/amm-routes/quoteSwap';
import { Ergo } from '../../../../src/chains/ergo/ergo';
import { Spectrum } from '../../../../src/connectors/spectrum/spectrum';
import { getErgoConfig } from '../../../../src/chains/ergo/ergo.config';
import { logger } from '../../../../src/services/logger';

jest.mock('../../../../src/chains/ergo/ergo.config', () => ({
  getErgoConfig: jest.fn(),
}));

jest.mock('../../../../src/chains/ergo/ergo', () => ({
  Ergo: {
    getInstance: jest.fn(),
  },
}));

jest.mock('../../../../src/connectors/spectrum/spectrum', () => ({
  Spectrum: {
    getInstance: jest.fn(),
  },
}));

describe('quoteSwapRoute', () => {
  let fastify: FastifyInstance;
  const mockErgo = {
    calculateGas: jest.fn().mockReturnValue(0.0001),
  };
  const mockSpectrum = {
    estimateTrade: jest.fn(),
  };

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(sensible);
    await fastify.register(quoteSwapRoute, { prefix: '/spectrum/amm' });

    jest.clearAllMocks();
    (getErgoConfig as jest.Mock).mockReturnValue({
      network: { minTxFee: 0.001 },
    });
    (Ergo.getInstance as jest.Mock).mockReturnValue(mockErgo);
    (Spectrum.getInstance as jest.Mock).mockReturnValue(mockSpectrum);
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /spectrum/amm/quote-swap', () => {
    it('should register the route correctly', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/spectrum/amm/quote-swap',
        query: {
          network: 'mainnet',
          baseToken: 'ERG',
          quoteToken: 'SIGUSD',
          side: 'SELL',
          amount: '0.01',
          slippagePct: '1',
          poolAddress: 'pool-address-123',
        },
      });

      expect(response.statusCode).not.toBe(404);
    });

    it('should return swap quote for valid query', async () => {
      mockSpectrum.estimateTrade.mockResolvedValue({
        amount: '0.01',
        expectedAmount: '100',
        price: '10000',
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/spectrum/amm/quote-swap',
        query: {
          network: 'mainnet',
          baseToken: 'ERG',
          quoteToken: 'SIGUSD',
          side: 'SELL',
          amount: '0.01',
          slippagePct: '1',
          poolAddress: 'pool-address-123',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        estimatedAmountIn: 0.01,
        estimatedAmountOut: 100,
        minAmountOut: 100,
        maxAmountIn: 0.01,
        baseTokenBalanceChange: -0.01,
        quoteTokenBalanceChange: 0.01,
        price: 10000,
        gasPrice: 0.0001,
        gasLimit: 150688,
        gasCost: 0.0001,
      });

      expect(mockSpectrum.estimateTrade).toHaveBeenCalledWith({
        network: 'mainnet',
        chain: 'ergo',
        connector: 'spectrum',
        allowedSlippage: '1',
        amount: '0.01',
        side: 'SELL',
        quote: 'SIGUSD',
        base: 'ERG',
      });
    });

    it('should return 500 for unsupported network', async () => {
      jest.spyOn(logger, 'error').mockReturnValue('error' as any); // just need to mock this to avoid error
      const response = await fastify.inject({
        method: 'GET',
        url: '/spectrum/amm/quote-swap',
        query: {
          network: 'testnet',
          baseToken: 'ERG',
          quoteToken: 'SIGUSD',
          side: 'SELL',
          amount: '0.01',
          slippagePct: '1',
          poolAddress: 'pool-address-123',
        },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Wrong network, network testnet is not supported',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Wrong network, network testnet is not supported',
      );
    });


    it('should handle errors from estimateTrade', async () => {
      const mockError = new Error('Estimation failed');
      mockSpectrum.estimateTrade.mockRejectedValue(mockError);

      const response = await fastify.inject({
        method: 'GET',
        url: '/spectrum/amm/quote-swap',
        query: {
          network: 'mainnet',
          baseToken: 'ERG',
          quoteToken: 'SIGUSD',
          side: 'SELL',
          amount: '0.01',
          slippagePct: '1',
          poolAddress: 'pool-address-123',
        },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Internal server error',
      });
    });

    it('should handle missing querystring parameters', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/spectrum/amm/quote-swap',
        query: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toEqual('Bad Request');
    });
  });
});

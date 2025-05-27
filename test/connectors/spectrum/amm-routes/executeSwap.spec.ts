import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import executeSwapRoute from '../../../../src/connectors/spectrum/amm-routes/executeSwap';
import { Spectrum } from '../../../../src/connectors/spectrum/spectrum';
import { logger } from '../../../../src/services/logger';
import { ExecuteSwapResponseType } from '../../../../src/schemas/trading-types/swap-schema';

// Mock dependencies
jest.mock('../../../../src/services/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../../src/connectors/spectrum/spectrum', () => {
  const mockExecuteTrade = jest.fn();
  const MockSpectrum = {
    getInstance: jest.fn().mockReturnValue({
      executeTrade: mockExecuteTrade,
    }),
  };
  return {
    Spectrum: MockSpectrum,
  };
});

describe('executeSwapRoute', () => {
  let fastify: FastifyInstance;
  let spectrum = Spectrum.getInstance('ergo', 'mainnet');

  const mockTradeResult: ExecuteSwapResponseType = {
    signature: 'signature',
    totalInputSwapped: 2,
    totalOutputSwapped: 1,
    fee:3,
    baseTokenBalanceChange: 3,
    quoteTokenBalanceChange: 2,
  };

  beforeEach(async () => {
    fastify = Fastify();
    
    await fastify.register(sensible);
    await fastify.register(executeSwapRoute, { prefix: '/spectrum/amm' });
    
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('POST /spectrum/amm/execute-swap', () => {
    it('should register the route correctly', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/execute-swap',
        payload: {
          network: 'mainnet',
          walletAddress: '0x123456789abcdef',
          baseToken: 'ERG',
          quoteToken: 'SIGUSD',
          amount: 0.1,
          side: 'SELL',
          slippagePct: 1,
          poolAddress: 'pool-address-123',
        },
      });
      
      expect(response.statusCode).not.toBe(404);
    });

    it('should validate request body and reject missing required fields', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/execute-swap',
        payload: {
          network: 'mainnet',
          // Missing other required fields
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error', 'Bad Request');
    });

    it('should validate the side field to be either BUY or SELL', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/execute-swap',
        payload: {
          network: 'mainnet-beta',
          walletAddress: '0x123456789abcdef',
          baseToken: 'ERG',
          quoteToken: 'SIGUSD',
          amount: 0.1,
          side: 'INVALID_SIDE',
          slippagePct: 1,
          poolAddress: 'pool-address-123',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error', 'Bad Request');
    });

    it('should call Spectrum.executeTrade with correct parameters and return the result', async () => {
      jest.spyOn(spectrum, 'executeTrade').mockResolvedValueOnce(mockTradeResult);
      
      const payload = {
        network: 'mainnet',
        walletAddress: '0x123456789abcdef',
        baseToken: 'ERG',
        quoteToken: 'SIGUSD',
        amount: 0.1,
        side: 'SELL',
        slippagePct: 1,
        poolAddress: 'pool-address-123',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/execute-swap',
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(mockTradeResult);
      
      expect(spectrum.executeTrade).toHaveBeenCalledWith({
        network: 'mainnet',
        walletAddress: '0x123456789abcdef',
        baseToken: 'ERG',
        quoteToken: 'SIGUSD',
        amount: 0.1,
        side: 'SELL',
        slippagePct: 1,
      });
    });

    it('should handle errors thrown by executeTrade method', async () => {
      const mockError = new Error('Failed to execute trade');
      jest.spyOn(spectrum, 'executeTrade').mockRejectedValue(mockError);

      
      const payload = {
        network: 'mainnet',
        walletAddress: '0x123456789abcdef',
        baseToken: 'ERG',
        quoteToken: 'SIGUSD',
        amount: 0.1,
        side: 'SELL',
        slippagePct: 1,
        poolAddress: 'pool-address-123',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/execute-swap',
        payload,
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toHaveProperty('error', 'Internal Server Error');
    });

    it('should use default network value when not provided', async () => {
      jest.spyOn(spectrum, 'executeTrade').mockResolvedValueOnce(mockTradeResult);
      
      const payload = {
        // network is not provided, so it should use the default 'mainnet-beta'
        walletAddress: '0x123456789abcdef',
        baseToken: 'ERG',
        quoteToken: 'SIGUSD',
        amount: 0.1,
        side: 'SELL',
        slippagePct: 1,
        poolAddress: 'pool-address-123',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/execute-swap',
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(spectrum.executeTrade).toHaveBeenCalledWith({
        network: 'mainnet-beta',
        walletAddress: '0x123456789abcdef',
        baseToken: 'ERG',
        quoteToken: 'SIGUSD',
        amount: 0.1,
        side: 'SELL',
        slippagePct: 1,
      });
    });

    it('should test with different side value (BUY)', async () => {
      jest.spyOn(spectrum, 'executeTrade').mockResolvedValueOnce(mockTradeResult);

      
      const payload = {
        network: 'mainnet',
        walletAddress: '0x123456789abcdef',
        baseToken: 'ERG',
        quoteToken: 'SIGUSD',
        amount: 0.2,
        side: 'BUY',
        slippagePct: 0.5,
        poolAddress: 'pool-address-123',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/execute-swap',
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(mockTradeResult);
      
      expect(spectrum.executeTrade).toHaveBeenCalledWith({
        network: 'mainnet',
        walletAddress: '0x123456789abcdef',
        baseToken: 'ERG',
        quoteToken: 'SIGUSD',
        amount: 0.2,
        side: 'BUY',
        slippagePct: 0.5,
      });
    });
  });
});
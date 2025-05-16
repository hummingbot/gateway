import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import { logger } from '../../../../src/services/logger';
import { Spectrum } from '../../../../src/connectors/spectrum/spectrum';
import { validatePriceRequest } from '../../../../src/connectors/connector.validators';
import priceRoute from '../../../../src/connectors/spectrum/routes/price';
import { PriceRequest, PriceResponse } from '../../../../src/connectors/connector.requests';

// Mock dependencies
jest.mock('../../../../src/services/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../../src/connectors/spectrum/spectrum', () => ({
  Spectrum: {
    getInstance: jest.fn(),
  },
}));

jest.mock('../../../../src/connectors/connector.validators', () => ({
  validatePriceRequest: jest.fn(),
}));

describe('priceRoute', () => {
  let fastify: FastifyInstance;
  const mockSpectrum = {
    estimateTrade: jest.fn(),
  };
  const payload: PriceRequest = {
    chain: 'ergo',
    connector: 'spectrum',
    network: 'mainnet',
    base: 'ERG',
    quote: 'SIGUSD',
    amount: '0.01',
    side: 'SELL',
    allowedSlippage: '1',
  };

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(sensible);
    await fastify.register(priceRoute, { prefix: '/spectrum/amm' });

    jest.clearAllMocks();
    (Spectrum.getInstance as jest.Mock).mockReturnValue(mockSpectrum);
    (validatePriceRequest as jest.Mock).mockImplementation(() => {}); // Default: no validation error
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('POST /spectrum/amm/price', () => {
    it('should register the route correctly', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/price',
        payload
      });

      expect(response.statusCode).not.toBe(404);
    });

    it('should return price quote for valid body', async () => {
      const mockPriceResponse:PriceResponse  = {
        base: 'base',
        quote: 'quote',
        amount: '12',
        rawAmount: '1',
        expectedAmount: '2',
        price: '21',
        network: 'mainnet',
        timestamp: 123456,
        latency: 2,
        gasPrice: 1,
        gasPriceToken: 'ERG ',
        gasLimit: 12,
        gasCost: '1',
      };
      mockSpectrum.estimateTrade.mockResolvedValue(mockPriceResponse);


      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/price',
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(mockPriceResponse);
      expect(validatePriceRequest).toHaveBeenCalledWith(payload);
      expect(Spectrum.getInstance).toHaveBeenCalledWith('ergo', 'mainnet');
      expect(mockSpectrum.estimateTrade).toHaveBeenCalledWith(payload);
    });

    it('should return 400 for invalid request body validation', async () => {

      const payload = {
        chain: 'ergo',
        network: 'mainnet',
        base: 'ERG',
        // Missing required fields to trigger validation error
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/price',
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
      });
    });

    it('should handle errors from estimateTrade', async () => {
      const mockError = new Error('Estimation failed');
      mockSpectrum.estimateTrade.mockRejectedValue(mockError);

      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/price',
        payload,
      });

      expect(response.statusCode).toBe(500);
      expect(validatePriceRequest).toHaveBeenCalledWith(payload);
      expect(mockSpectrum.estimateTrade).toHaveBeenCalledWith(payload);
    });

    it('should handle missing body parameters', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/price',
        payload: {}, // No body parameters
      });
      console.log('Response:', response.json());

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toEqual('Bad Request');
    });
  });
});

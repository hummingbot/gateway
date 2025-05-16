import Fastify, { FastifyInstance } from 'fastify';
import {spectrumRoutes} from '../../../src/connectors/spectrum/spectrum.routes';
import { Ergo } from '../../../src/chains/ergo/ergo';
import { ErgoController } from '../../../src/chains/ergo/ergo.controllers';
import * as validators from '../../../src/connectors/connector.validators';
import { Spectrum } from '../../../src/connectors/spectrum/spectrum';
import {
  ExecuteSwapRequestType,
  ExecuteSwapResponseType,
  GetSwapQuoteRequestType,
} from '../../../src/schemas/trading-types/swap-schema';
import * as conf  from '../../../src/chains/ergo/ergo.config';
import { logger } from '../../../src/services/logger';
import { PriceResponse } from '../../../src/connectors/connector.requests';
import { SpectrumConfig } from '../../../src/connectors/spectrum/spectrum.config';

describe('spectrumRoutes', () => {
  let fastify: FastifyInstance;
  let ergo = new Ergo('mainnet');
  let spectrum = Spectrum.getInstance('ergo', 'mainnet');

  const mockStatus = { height: 1234, network: 'mainnet' };
  const mockChainInstance = ergo;

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(spectrumRoutes.amm);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /ergo/status', () => {
    it('should return chain status for valid network', async () => {
      jest.spyOn(Ergo, 'getInstance').mockReturnValue(mockChainInstance);
      jest
        .spyOn(ErgoController, 'getStatus')
        .mockResolvedValue(mockStatus as any);

      const response = await fastify.inject({
        method: 'GET',
        url: '/status',
        query: { network: 'mainnet' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(mockStatus);
      expect(Ergo.getInstance).toHaveBeenCalledWith('mainnet');
      expect(ErgoController.getStatus).toHaveBeenCalledWith(mockChainInstance, {
        network: 'mainnet',
      });
    });

    it('should handle errors gracefully', async () => {
      jest.spyOn(Ergo, 'getInstance').mockImplementation(() => {
        throw new Error('Chain initialization failed');
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/status',
        query: { network: 'mainnet' },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toHaveProperty('error');
    });
  });

  describe('POST /spectrum/amm/price', () => {
    const mockPriceResponse = {
      price: '100.50',
      base: 'SIGUSD',
      quote: 'ERG',
      amount: '10',
      rawAmount: '5',
      expectedAmount: '9',
      network: 'mainnet',
      timestamp: 1234566,
      latency: 1,
      gasPrice: 10000000,
      gasPriceToken: 'ERG',
      gasLimit: 200000000,
      gasCost: '10000',
      gasWanted: '20000',
    };

    const mockPriceRequest = {
      chain: 'ergo',
      network: 'mainnet',
      connector: 'spectrum',
      quote: 'ERG',
      base: 'SIGUSD',
      amount: '10',
      side: 'BUY',
    };

    it('should return price quote for valid request', async () => {
      jest.spyOn(validators, 'validatePriceRequest').mockReturnValue;
      jest
        .spyOn(spectrum, 'estimateTrade')
        .mockResolvedValue(mockPriceResponse);

      const response = await fastify.inject({
        method: 'POST',
        url: '/price',
        payload: mockPriceRequest,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(mockPriceResponse);
      expect(spectrum.estimateTrade).toHaveBeenCalledWith(mockPriceRequest);
      expect(validators.validatePriceRequest).toHaveBeenCalledWith(
        mockPriceRequest,
      );
    });

    it('should return 400 for invalid price request', async () => {
      jest.spyOn(validators, 'validatePriceRequest').mockImplementation(() => {
        throw new Error('Invalid price request');
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/price',
        payload: { chain: 'ergo' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });
  });

  describe('POST /spectrum/amm/trade', () => {
    it('should execute trade for valid request', async () => {
      const mockTradeRequest: ExecuteSwapRequestType = {
        network: 'mainnet',
        walletAddress: 'walletAddress123',
        quoteToken: 'SIGUSD',
        baseToken: 'ERG',
        side: 'BUY',
        slippagePct: 1,
        amount: 10,
      };
      const mockTradeResponse: ExecuteSwapResponseType = {
        baseTokenBalanceChange: 10,
        quoteTokenBalanceChange: 0.001,
        fee: 2000,
        signature: 'txId',
        totalInputSwapped: 10,
        totalOutputSwapped: 0.001,
      };
      jest.spyOn(spectrum, 'executeTrade').mockResolvedValue(mockTradeResponse),
        jest.spyOn(validators, 'validateTradeRequest').mockReturnValue();

      const response = await fastify.inject({
        method: 'POST',
        url: '/execute-swap',
        payload: mockTradeRequest,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(mockTradeResponse);
      expect(spectrum.executeTrade).toHaveBeenCalledWith(mockTradeRequest);
    });

    it('should return 400 for invalid trade request', async () => {
      jest.spyOn(validators, 'validateTradeRequest').mockImplementation(() => {
        throw new Error('Invalid trade request');
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/execute-swap',
        payload: { chain: 'ergo' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });
  });

  describe('GET /quote-swap', () => {
    it('should return swap quote for valid request', async () => {
      const mockQuoteRequest: GetSwapQuoteRequestType = {
        network: 'mainnet',
        baseToken: 'ERG',
        quoteToken: 'SIGUSD',
        amount: 10,
        side: 'SELL',
      };

      const mockEstimateResponse: PriceResponse = {
        base: 'ERG',
        quote: 'SIGUSD',
        amount: '10',
        rawAmount: '5',
        expectedAmount: '8',
        price: '2',
        network: 'mainnet',
        timestamp: 123456,
        latency: 3,
        gasPrice: 20000000,
        gasPriceToken: 'ERG',
        gasLimit: 200000000,
        gasCost: '20000',
      };
      const mockConfig = { network: { minTxFee: 1000000 } };
      jest.spyOn(spectrum, 'estimateTrade').mockResolvedValue(mockEstimateResponse);
      jest.spyOn(conf, 'getErgoConfig').mockReturnValue(mockConfig as any) ;
      jest.spyOn(logger, 'error').mockImplementation();
      jest.spyOn(Ergo, 'getInstance').mockReturnValue(mockChainInstance);
      jest.spyOn(Spectrum, 'getInstance').mockReturnValue(spectrum);
      jest.spyOn(mockChainInstance, 'calculateGas').mockReturnValue(20000000);

      const response = await fastify.inject({
        method: 'GET',
        url: '/quote-swap',
        query: {
          network: 'mainnet',
          baseToken: 'ERG',
          quoteToken: 'SIGUSD',
          amount: '10',
          side: 'SELL',
         }
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        estimatedAmountIn: 10,
        estimatedAmountOut: 8,
        minAmountOut: 8,
        maxAmountIn: 10,
        baseTokenBalanceChange: -10,
        quoteTokenBalanceChange: 10,
        price: 2,
        gasPrice: 20000000,
        gasLimit: SpectrumConfig.config.gasLimitEstimate,
        gasCost: 20000000,
      });
    });

    it('should return 500 for non-mainnet network', async () => {
      const mockQuoteRequest: GetSwapQuoteRequestType = {
        network: 'non-mainnet',
        baseToken: 'ERG',
        quoteToken: 'SIGUSD',
        amount: 10,
        side: 'SELL',
      };
      jest.spyOn(logger, 'error').mockRejectedValue;
      const response = await fastify.inject({
        method: 'GET',
        url: '/quote-swap',
        query: {
          network: 'non-mainnet',
          baseToken: 'ERG',
          quoteToken: 'SIGUSD',
          amount: '10',
          side: 'SELL',
         }
      });
      expect(response.statusCode).toBe(500);
      expect(logger.error).toHaveBeenCalledWith(
        `Wrong network, network non-mainnet is not supported`,
      );
    });

    it('should handle if any error occurs', async () => {
      const mockQuoteRequest: GetSwapQuoteRequestType = {
        network: 'mainnet',
        baseToken: 'ERG',
        quoteToken: 'SIGUSD',
        amount: 10,
        side: 'SELL',
      };
      jest.spyOn(spectrum, 'estimateTrade').mockRejectedValue(Object.assign(new Error('Too Many Requests'), { statusCode: 429 }));
      const response = await fastify.inject({
        method: 'GET',
        url: '/quote-swap',
        query: {
          network: 'mainnet',
          baseToken: 'ERG',
          quoteToken: 'SIGUSD',
          amount: '10',
          side: 'SELL',
         }
      });
      expect(response.statusCode).toBe(429);
      expect(response.json()).toHaveProperty('error');
      expect(response.json().error).toBe('Too Many Requests');
    });
  });
});

import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import addLiquidityRoute from '../../../../src/connectors/spectrum/amm-routes/addLiquidity';
import { logger } from '../../../../src/services/logger';

// Mock logger to prevent console output during tests
jest.mock('../../../../src/services/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('addLiquidityRoute', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();
    
    await fastify.register(sensible);
    await fastify.register(addLiquidityRoute, { prefix: '/spectrum/amm' });
    
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('POST /spectrum/amm/add-liquidity', () => {
    it('should register the route correctly', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/add-liquidity',
        payload: {
          network: 'mainnet-beta',
          poolAddress: '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
          slippagePct: 1,
          baseTokenAmount: 1,
          quoteTokenAmount: 1,
        },
      });
      
      expect(response.statusCode).not.toBe(404);
    });

    it('should validate request body and reject missing required fields', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/add-liquidity',
        payload: {
          network: 'mainnet-beta',
          // Missing other required fields
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error', 'Bad Request');
    });

    it('should handle the route with valid request parameters', async () => {
      const payload = {
        network: 'mainnet-beta',
        poolAddress: '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
        slippagePct: 1,
        baseTokenAmount: 1,
        quoteTokenAmount: 1,
        walletAddress: 'some-wallet-address',
        baseToken: 'RAY',
        quoteToken: 'USDC'
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/add-liquidity',
        payload,
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toHaveProperty('error', 'Internal Server Error');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should properly handle application errors and log them', async () => {
      const payload = {
        network: 'mainnet-beta',
        poolAddress: '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
        slippagePct: 1,
        baseTokenAmount: 1,
        quoteTokenAmount: 1,
        walletAddress: 'some-wallet-address',
        baseToken: 'RAY',
        quoteToken: 'USDC'
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/add-liquidity',
        payload,
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body).toHaveProperty('error', 'Internal Server Error');
      expect(body).toHaveProperty('message', 'Internal server error');
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
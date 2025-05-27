import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import quoteLiquidityRoute from '../../../../src/connectors/spectrum/amm-routes/quoteLiquidity';

// Mock dependencies
jest.mock('../../../../src/services/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('quoteLiquidityRoute', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(sensible);
    await fastify.register(quoteLiquidityRoute, { prefix: '/spectrum/amm' });

    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /spectrum/amm/quote-liquidity', () => {
    it('should register the route correctly', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/spectrum/amm/quote-liquidity',
        query: {
          network: 'mainnet-beta',
          poolAddress: 'pool-address-123',
          baseTokenAmount: '1',
          quoteTokenAmount: '1',
          slippagePct: '1',
        },
      });

      expect(response.statusCode).not.toBe(404);
    });

    it('should return 500 with "Failed to quote position" error for valid query', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/spectrum/amm/quote-liquidity',
        query: {
          network: 'mainnet-beta',
          poolAddress: 'pool-address-123',
          baseTokenAmount: '1',
          quoteTokenAmount: '1',
          slippagePct: '1',
        },
      });

      expect(response.statusCode).toBe(500);
    });

    it('should handle missing querystring parameters', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/spectrum/amm/quote-liquidity',
        query: {}, // No query parameters
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toEqual('Bad Request');
    });
  });
});

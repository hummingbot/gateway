import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import positionInfoRoute from '../../../../src/connectors/spectrum/amm-routes/positionInfo';

// Mock dependencies
jest.mock('../../../../src/services/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('positionInfoRoute', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(sensible);
    await fastify.register(positionInfoRoute, { prefix: '/spectrum/amm' });

    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /spectrum/amm/position-info', () => {
    it('should register the route correctly', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/spectrum/amm/position-info',
        query: {
          network: 'mainnet-beta',
          poolAddress: 'pool-address-123',
          walletAddress: '0x123456789abcdef',
        },
      });

      expect(response.statusCode).not.toBe(404);
    });

    it('should return 500 with "Failed to fetch position info" error for valid query', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/spectrum/amm/position-info',
        query: {
          network: 'mainnet-beta',
          poolAddress: 'pool-address-123',
          walletAddress: '0x123456789abcdef',
        },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Failed to fetch position info',
      });
    });

    it('should handle missing querystring parameters', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/spectrum/amm/position-info',
        query: {}, // No query parameters
      });
      console.log('Response:', response.json());

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toEqual('Bad Request');
    });
  });
});

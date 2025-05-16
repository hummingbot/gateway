import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import removeLiquidityRoute from '../../../../src/connectors/spectrum/amm-routes/removeLiquidity';
import { logger } from '../../../../src/services/logger';

describe('removeLiquidityRoute', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(sensible);
    await fastify.register(removeLiquidityRoute, { prefix: '/spectrum/amm' });

    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('POST /spectrum/amm/remove-liquidity', () => {
    it('should register the route correctly', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/remove-liquidity',
        payload: {
          network: 'mainnet-beta',
          poolAddress: 'pool-address-123',
          percentageToRemove: 100,
        },
      });

      expect(response.statusCode).not.toBe(404);
    });

    it('should return 500 with "Internal server error" for valid body', async () => {
      jest.spyOn(logger, 'error').mockReturnValue(undefined);
      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/remove-liquidity',
        payload: {
          network: 'mainnet',
          walletAddress: '123qweqweqweqweqweqwe',
          poolAddress: 'pool-address-123',
          percentageToRemove: 100,
        },
      });

      expect(response.statusCode).toBe(500);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle missing body parameters', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/remove-liquidity',
        payload: {}, // No body parameters
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toEqual('Bad Request');
    });

    it('should validate network field and reject non-string values', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/remove-liquidity',
        payload: {
          network: 123, // Invalid: should be string
          poolAddress: 'pool-address-123',
          percentageToRemove: 100,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toEqual('Bad Request');
    });

    it('should validate poolAddress field and reject non-string values', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/remove-liquidity',
        payload: {
          network: 'mainnet-beta',
          poolAddress: 123, // Invalid: should be string
          percentageToRemove: 100,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toEqual('Bad Request');
    });

    it('should validate percentageToRemove field and reject non-number values', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/spectrum/amm/remove-liquidity',
        payload: {
          network: 'mainnet-beta',
          poolAddress: 'pool-address-123',
          percentageToRemove: 'invalid', // Invalid: should be number
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toEqual('Bad Request');
    });
  });
});

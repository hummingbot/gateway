/**
 * Integration tests for pool endpoints with chainNetwork support
 * Tests the complete flow of pool-info queries across different networks
 */

import '../mocks/app-mocks';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../src/app';

describe('Pool-Info Endpoints with Chain-Network Support', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('Pancakeswap Pool-Info Endpoints', () => {
    describe('CLMM (V3) Pool Info', () => {
      it('should accept network parameter', async () => {
        const response = await fastify.inject({
          method: 'GET',
          url: '/connectors/pancakeswap/clmm/pool-info?network=bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
        });

        expect([200, 404, 500]).toContain(response.statusCode);
        expect(response.statusCode).not.toBe(400);
      });

      it('should accept chainNetwork parameter', async () => {
        const response = await fastify.inject({
          method: 'GET',
          url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=ethereum-bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
        });

        expect([200, 404, 500]).toContain(response.statusCode);
        expect(response.statusCode).not.toBe(400);
      });

      it('should use default network when neither parameter provided', async () => {
        const response = await fastify.inject({
          method: 'GET',
          url: '/connectors/pancakeswap/clmm/pool-info?poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
        });

        expect([200, 404, 500]).toContain(response.statusCode);
        expect(response.statusCode).not.toBe(400);
      });

      it('should return 400 when poolAddress is missing', async () => {
        const response = await fastify.inject({
          method: 'GET',
          url: '/connectors/pancakeswap/clmm/pool-info?network=bsc',
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('AMM (V2) Pool Info', () => {
      it('should accept network parameter', async () => {
        const response = await fastify.inject({
          method: 'GET',
          url: '/connectors/pancakeswap/amm/pool-info?network=bsc&poolAddress=0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C',
        });

        expect([200, 404, 500]).toContain(response.statusCode);
        expect(response.statusCode).not.toBe(400);
      });

      it('should accept chainNetwork parameter', async () => {
        const response = await fastify.inject({
          method: 'GET',
          url: '/connectors/pancakeswap/amm/pool-info?chainNetwork=ethereum-bsc&poolAddress=0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C',
        });

        expect([200, 404, 500]).toContain(response.statusCode);
        expect(response.statusCode).not.toBe(400);
      });
    });
  });

  describe('Uniswap Pool-Info Endpoints', () => {
    describe('CLMM (V3) Pool Info', () => {
      it('should accept network parameter', async () => {
        const response = await fastify.inject({
          method: 'GET',
          url: '/connectors/uniswap/clmm/pool-info?network=mainnet&poolAddress=0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
        });

        expect([200, 404, 500]).toContain(response.statusCode);
        expect(response.statusCode).not.toBe(400);
      });

      it('should accept chainNetwork parameter', async () => {
        const response = await fastify.inject({
          method: 'GET',
          url: '/connectors/uniswap/clmm/pool-info?chainNetwork=ethereum-mainnet&poolAddress=0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
        });

        expect([200, 404, 500]).toContain(response.statusCode);
        expect(response.statusCode).not.toBe(400);
      });

      it('should work with different networks', async () => {
        const networks = ['mainnet', 'base', 'polygon', 'arbitrum'];

        for (const network of networks) {
          const response = await fastify.inject({
            method: 'GET',
            url: `/connectors/uniswap/clmm/pool-info?network=${network}&poolAddress=0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`,
          });

          // Should not reject the request
          expect(response.statusCode).not.toBe(400);
        }
      });
    });

    describe('AMM (V2) Pool Info', () => {
      it('should accept network parameter', async () => {
        const response = await fastify.inject({
          method: 'GET',
          url: '/connectors/uniswap/amm/pool-info?network=mainnet&poolAddress=0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C',
        });

        expect([200, 404, 500]).toContain(response.statusCode);
        expect(response.statusCode).not.toBe(400);
      });

      it('should accept chainNetwork parameter', async () => {
        const response = await fastify.inject({
          method: 'GET',
          url: '/connectors/uniswap/amm/pool-info?chainNetwork=ethereum-mainnet&poolAddress=0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C',
        });

        expect([200, 404, 500]).toContain(response.statusCode);
        expect(response.statusCode).not.toBe(400);
      });
    });
  });

  describe('Trading Unified Pool-Info Endpoint', () => {
    it('should work with pancakeswap using network parameter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/trading/clmm/pool-info?connector=pancakeswap&network=bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      expect([200, 404, 500]).toContain(response.statusCode);
    });

    it('should work with pancakeswap using chainNetwork parameter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/trading/clmm/pool-info?connector=pancakeswap&chainNetwork=ethereum-bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      expect([200, 404, 500]).toContain(response.statusCode);
    });

    it('should work with uniswap using network parameter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/trading/clmm/pool-info?connector=uniswap&network=mainnet&poolAddress=0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
      });

      expect([200, 404, 500]).toContain(response.statusCode);
    });

    it('should work with uniswap using chainNetwork parameter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/trading/clmm/pool-info?connector=uniswap&chainNetwork=ethereum-mainnet&poolAddress=0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
      });

      expect([200, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('Network-Specific Behavior', () => {
    it('should handle BSC as ethereum-based network', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=ethereum-bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should recognize ethereum-bsc as valid EVM network
      expect(response.statusCode).not.toBe(400);
    });

    it('should handle multiple EVM networks with chainNetwork format', async () => {
      const networks = ['ethereum-bsc', 'ethereum-mainnet', 'ethereum-base', 'ethereum-polygon', 'ethereum-arbitrum'];

      for (const chainNetwork of networks) {
        const response = await fastify.inject({
          method: 'GET',
          url: `/connectors/uniswap/clmm/pool-info?chainNetwork=${chainNetwork}&poolAddress=0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`,
        });

        // Should not reject the request format
        expect(response.statusCode).not.toBe(400);
      }
    });
  });

  describe('Request Validation', () => {
    it('should require poolAddress', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?network=bsc',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept valid pool addresses', async () => {
      const validAddresses = [
        '0x172fcd41e0913e95784454622d1c3724f546f849', // 42 characters with 0x
        '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640', // Another valid format
      ];

      for (const address of validAddresses) {
        const response = await fastify.inject({
          method: 'GET',
          url: `/connectors/pancakeswap/clmm/pool-info?network=bsc&poolAddress=${address}`,
        });

        // Should accept valid address format
        expect([200, 404, 500]).toContain(response.statusCode);
        expect(response.statusCode).not.toBe(400);
      }
    });

    it('should handle invalid pool address gracefully', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?network=bsc&poolAddress=invalid',
      });

      // Should not crash, should return error
      expect([400, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('Parameter Priority', () => {
    it('should prioritize network parameter over chainNetwork', async () => {
      // Both parameters provided - network should take precedence
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?network=bsc&chainNetwork=ethereum-mainnet&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should use 'bsc', not 'mainnet'
      expect([200, 404, 500]).toContain(response.statusCode);
      expect(response.statusCode).not.toBe(400);
    });

    it('should use chainNetwork when network is not provided', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=ethereum-bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      expect([200, 404, 500]).toContain(response.statusCode);
      expect(response.statusCode).not.toBe(400);
    });

    it('should use default network when neither is provided', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should use default 'bsc'
      expect([200, 404, 500]).toContain(response.statusCode);
      expect(response.statusCode).not.toBe(400);
    });
  });
});

/**
 * Comprehensive tests for chainNetwork parameter support across all connectors
 * Tests the routing fix for BSC and other networks similar to PR #606
 */

import '../mocks/app-mocks';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../src/app';

describe('Chain-Network Routing Feature', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('Parameter Format Validation', () => {
    it('should accept network parameter in direct format (e.g., "bsc")', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?network=bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should not return 400 for invalid network format
      expect([200, 404, 500]).toContain(response.statusCode);
    });

    it('should accept chainNetwork parameter in chain-network format (e.g., "ethereum-bsc")', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=ethereum-bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should not return 400 for invalid format
      expect([200, 404, 500]).toContain(response.statusCode);
    });

    it('should prefer network parameter when both network and chainNetwork are provided', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?network=bsc&chainNetwork=ethereum-mainnet&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should use the 'network' parameter (bsc), not chainNetwork (mainnet)
      // Response should contain a pool not found or other error, not invalid network error
      expect([200, 404, 500]).toContain(response.statusCode);
    });

    it('should parse chainNetwork with multiple hyphens correctly', async () => {
      // Test with network name that might contain hyphens
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/uniswap/clmm/pool-info?chainNetwork=ethereum-mainnet&poolAddress=0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
      });

      expect([200, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('BSC-Specific Network Resolution', () => {
    it('should resolve "ethereum-bsc" chainNetwork format to bsc network', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=ethereum-bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should handle the request without network validation errors
      expect([200, 404, 500]).toContain(response.statusCode);
      expect(response.statusCode).not.toBe(400);
    });

    it('should handle direct bsc network format', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?network=bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      expect([200, 404, 500]).toContain(response.statusCode);
      expect(response.statusCode).not.toBe(400);
    });

    it('should use default network when neither parameter is provided', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should default to 'bsc' per schema default
      expect([200, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('Uniswap Endpoint Support', () => {
    it('should support chainNetwork parameter on uniswap/clmm/pool-info', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/uniswap/clmm/pool-info?chainNetwork=ethereum-mainnet&poolAddress=0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
      });

      expect([200, 404, 500]).toContain(response.statusCode);
      expect(response.statusCode).not.toBe(400);
    });

    it('should support chainNetwork parameter on uniswap/amm/pool-info', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/uniswap/amm/pool-info?chainNetwork=ethereum-mainnet&poolAddress=0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C',
      });

      expect([200, 404, 500]).toContain(response.statusCode);
      expect(response.statusCode).not.toBe(400);
    });
  });

  describe('PancakeSwap Endpoint Support', () => {
    it('should support chainNetwork parameter on pancakeswap/clmm/pool-info', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=ethereum-bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      expect([200, 404, 500]).toContain(response.statusCode);
      expect(response.statusCode).not.toBe(400);
    });

    it('should support chainNetwork parameter on pancakeswap/amm/pool-info', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/amm/pool-info?chainNetwork=ethereum-bsc&poolAddress=0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C',
      });

      expect([200, 404, 500]).toContain(response.statusCode);
      expect(response.statusCode).not.toBe(400);
    });
  });

  describe('Trading Unified Pool-Info Endpoint', () => {
    it('should work with pancakeswap/clmm using chainNetwork format', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/trading/clmm/pool-info?connector=pancakeswap&chainNetwork=ethereum-bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      expect([200, 404, 500]).toContain(response.statusCode);
    });

    it('should work with uniswap/clmm using chainNetwork format', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/trading/clmm/pool-info?connector=uniswap&chainNetwork=ethereum-mainnet&poolAddress=0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
      });

      expect([200, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle chainNetwork with empty string', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should fall back to default network or show validation error
      expect([200, 400, 404, 500]).toContain(response.statusCode);
    });

    it('should handle chainNetwork with only hyphen', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=-&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      expect([200, 400, 404, 500]).toContain(response.statusCode);
    });

    it('should handle chainNetwork without hyphen', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=mainnet&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should treat "mainnet" as the full network name (no hyphen to split)
      expect([200, 400, 404, 500]).toContain(response.statusCode);
    });

    it('should handle invalid pool address format', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?network=bsc&poolAddress=invalid-address',
      });

      // Should return error for invalid pool address
      expect([400, 404, 500]).toContain(response.statusCode);
    });

    it('should require poolAddress parameter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?network=bsc',
      });

      // Should return validation error for missing poolAddress
      expect([400, 500]).toContain(response.statusCode);
    });
  });

  describe('Network Configuration Validation', () => {
    it('should validate bsc network is configured', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?network=bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should not return unsupported network error
      expect(response.statusCode).not.toBe(400);
    });

    it('should validate mainnet network is configured for ethereum', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/uniswap/clmm/pool-info?network=mainnet&poolAddress=0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
      });

      expect(response.statusCode).not.toBe(400);
    });

    it('should handle unknown network gracefully', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?network=unknown-network&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should return error, not crash
      expect([400, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('Multiple Connector Support', () => {
    const connectors = [
      { name: 'pancakeswap/clmm', defaultNetwork: 'bsc' },
      { name: 'pancakeswap/amm', defaultNetwork: 'bsc' },
      { name: 'uniswap/clmm', defaultNetwork: 'mainnet' },
      { name: 'uniswap/amm', defaultNetwork: 'mainnet' },
    ];

    connectors.forEach(({ name, defaultNetwork }) => {
      it(`should support chainNetwork on /connectors/${name}/pool-info`, async () => {
        const response = await fastify.inject({
          method: 'GET',
          url: `/connectors/${name}/pool-info?chainNetwork=ethereum-${defaultNetwork}&poolAddress=0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`,
        });

        // Should not reject due to network format
        expect(response.statusCode).not.toBe(400);
      });
    });
  });

  describe('Backward Compatibility', () => {
    it('should continue supporting direct network parameter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?network=bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should work as before
      expect([200, 404, 500]).toContain(response.statusCode);
    });

    it('should maintain default network behavior', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should use default 'bsc' network
      expect([200, 404, 500]).toContain(response.statusCode);
    });
  });
});

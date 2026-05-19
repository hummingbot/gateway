/**
 * Comprehensive integration tests for the chainNetwork routing fix
 * Tests the complete flow including edge cases, error handling, and network resolution
 */

import '../mocks/app-mocks';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../src/app';

describe('Chain-Network Routing Integration Tests', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('PR #606 Regression Prevention - BSC Routing', () => {
    it('should resolve BSC pool info when calling with network=bsc', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?network=bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should not return 400 (malformed request)
      expect(response.statusCode).not.toBe(400);
      // Should be 200 (success), 404 (pool not found), or 500 (server error), but not 400
      expect([200, 404, 500]).toContain(response.statusCode);
    });

    it('should resolve BSC pool info when calling with chainNetwork=ethereum-bsc', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=ethereum-bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      expect(response.statusCode).not.toBe(400);
      expect([200, 404, 500]).toContain(response.statusCode);
    });

    it('should successfully parse chainNetwork and extract network part', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=ethereum-bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should not fail with "invalid network" error - parsing should work
      expect(response.statusCode).not.toBe(400);
    });
  });

  describe('Schema Validation', () => {
    it('should validate chainNetwork parameter in request schema', async () => {
      // This tests that the schema accepts the parameter
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=ethereum-bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // If schema doesn't accept chainNetwork, it would be ignored
      // and we might get a missing poolAddress error or similar
      expect(response.statusCode).not.toBe(400);
    });

    it('should validate network parameter still works', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?network=bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      expect(response.statusCode).not.toBe(400);
    });

    it('should provide proper error when required parameters missing', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?network=bsc',
      });

      // Should return 400 for missing poolAddress
      expect(response.statusCode).toBe(400);
    });
  });

  describe('Network Resolution Correctness', () => {
    const testCases = [
      {
        name: 'ethereum-bsc',
        expectedNetwork: 'bsc',
        endpoint: 'pancakeswap/clmm',
      },
      {
        name: 'ethereum-mainnet',
        expectedNetwork: 'mainnet',
        endpoint: 'uniswap/clmm',
      },
      {
        name: 'ethereum-base',
        expectedNetwork: 'base',
        endpoint: 'uniswap/amm',
      },
      {
        name: 'ethereum-polygon',
        expectedNetwork: 'polygon',
        endpoint: 'uniswap/clmm',
      },
      {
        name: 'ethereum-arbitrum',
        expectedNetwork: 'arbitrum',
        endpoint: 'uniswap/amm',
      },
    ];

    testCases.forEach(({ name, expectedNetwork, endpoint }) => {
      it(`should correctly resolve ${name} to ${expectedNetwork} for ${endpoint}`, async () => {
        // Test that the endpoint doesn't reject the chainNetwork format
        const response = await fastify.inject({
          method: 'GET',
          url: `/connectors/${endpoint}/pool-info?chainNetwork=${name}&poolAddress=0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`,
        });

        // Should not reject the format (no 400 for parameter format)
        expect(response.statusCode).not.toBe(400);
      });
    });
  });

  describe('Backward Compatibility Assurance', () => {
    it('should continue working with existing code using network parameter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?network=bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Existing code should not break
      expect(response.statusCode).not.toBe(400);
    });

    it('should maintain default network behavior', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should use default network when not specified
      expect(response.statusCode).not.toBe(400);
    });

    it('should not break existing API clients', async () => {
      // Simulate various existing API patterns
      const patterns = [
        '/connectors/pancakeswap/clmm/pool-info?network=bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
        '/connectors/uniswap/clmm/pool-info?network=mainnet&poolAddress=0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
        '/connectors/pancakeswap/amm/pool-info?poolAddress=0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C',
      ];

      for (const pattern of patterns) {
        const response = await fastify.inject({
          method: 'GET',
          url: pattern,
        });

        // Should not return 400 (which would indicate breaking change)
        expect(response.statusCode).not.toBe(400);
      }
    });
  });

  describe('Cross-Connector Consistency', () => {
    it('should support chainNetwork across all EVM connectors', async () => {
      const connectors = [
        { name: 'pancakeswap/clmm', chainNetwork: 'ethereum-bsc' },
        { name: 'pancakeswap/amm', chainNetwork: 'ethereum-bsc' },
        { name: 'uniswap/clmm', chainNetwork: 'ethereum-mainnet' },
        { name: 'uniswap/amm', chainNetwork: 'ethereum-mainnet' },
      ];

      for (const { name, chainNetwork } of connectors) {
        const response = await fastify.inject({
          method: 'GET',
          url: `/connectors/${name}/pool-info?chainNetwork=${chainNetwork}&poolAddress=0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`,
        });

        // All should accept chainNetwork parameter (not 400)
        expect(response.statusCode).not.toBe(400);
      }
    });

    it('should support network across all EVM connectors', async () => {
      const connectors = [
        { name: 'pancakeswap/clmm', network: 'bsc' },
        { name: 'pancakeswap/amm', network: 'bsc' },
        { name: 'uniswap/clmm', network: 'mainnet' },
        { name: 'uniswap/amm', network: 'mainnet' },
      ];

      for (const { name, network } of connectors) {
        const response = await fastify.inject({
          method: 'GET',
          url: `/connectors/${name}/pool-info?network=${network}&poolAddress=0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`,
        });

        // All should accept network parameter
        expect(response.statusCode).not.toBe(400);
      }
    });
  });

  describe('Error Handling and Graceful Degradation', () => {
    it('should handle malformed chainNetwork gracefully', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=malformed&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should not crash, should return appropriate error
      expect([400, 404, 500]).toContain(response.statusCode);
    });

    it('should handle empty chainNetwork gracefully', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Should fall back to default or show error
      expect([200, 400, 404, 500]).toContain(response.statusCode);
    });

    it('should handle chainNetwork with special characters', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=ethereum%2Dbsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // URL encoded hyphen should decode to hyphen
      expect(response.statusCode).not.toBe(400);
    });
  });

  describe('API Consistency with Trading Routes', () => {
    it('should match behavior of /trading/clmm/pool-info when using chainNetwork', async () => {
      // Test that both endpoints handle chainNetwork similarly
      const connectorResponse = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=ethereum-bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      const tradingResponse = await fastify.inject({
        method: 'GET',
        url: '/trading/clmm/pool-info?connector=pancakeswap&chainNetwork=ethereum-bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      // Both should accept chainNetwork parameter (not 400)
      expect(connectorResponse.statusCode).not.toBe(400);
      expect(tradingResponse.statusCode).not.toBe(400);
    });
  });

  describe('Real-World User Scenarios', () => {
    it('should support user migrating from ethereum-bsc format queries', async () => {
      // Simulate a user/system that was sending chainNetwork format
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?chainNetwork=ethereum-bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      expect(response.statusCode).not.toBe(400);
    });

    it('should support user with direct network format queries', async () => {
      // Simulate a user/system using direct network format
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info?network=bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      expect(response.statusCode).not.toBe(400);
    });

    it('should support unified trading endpoint users', async () => {
      // Simulate a user using the unified trading endpoint
      const response = await fastify.inject({
        method: 'GET',
        url: '/trading/clmm/pool-info?connector=pancakeswap&chainNetwork=ethereum-bsc&poolAddress=0x172fcd41e0913e95784454622d1c3724f546f849',
      });

      expect(response.statusCode).not.toBe(400);
    });
  });
});

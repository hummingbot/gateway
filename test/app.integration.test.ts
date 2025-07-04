import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import './mocks/app-mocks';

import { gatewayApp } from '../src/app';

describe('App Integration - Route Registration', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('Connector Route Structure', () => {
    it('should register routes based on connector trading types', async () => {
      // Get the list of connectors and their trading types
      const connectorsResponse = await fastify.inject({
        method: 'GET',
        url: '/connectors',
      });

      const { connectors } = JSON.parse(connectorsResponse.body);

      // Test each connector has the expected routes based on trading types
      for (const connector of connectors) {
        const { name, trading_types } = connector;

        // Test router routes
        if (trading_types.includes('router')) {
          // For 0x, test get-price; for others, test quote-swap
          const endpoint = name === '0x' ? 'get-price' : 'quote-swap';
          const routerResponse = await fastify.inject({
            method: 'GET',
            url: `/connectors/${name}/router/${endpoint}`,
          });
          // Should not be 404 if the route exists
          expect(routerResponse.statusCode).not.toBe(404);
        }

        // Test AMM routes
        if (trading_types.includes('amm')) {
          const ammResponse = await fastify.inject({
            method: 'GET',
            url: `/connectors/${name}/amm/pool-info`,
          });
          expect(ammResponse.statusCode).not.toBe(404);
        }

        // Test CLMM routes
        if (trading_types.includes('clmm')) {
          const clmmResponse = await fastify.inject({
            method: 'GET',
            url: `/connectors/${name}/clmm/pool-info`,
          });
          expect(clmmResponse.statusCode).not.toBe(404);
        }
      }
    });
  });

  describe('Trading Type Validation', () => {
    it('should return valid trading types for all connectors', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors',
      });

      const data = JSON.parse(response.body);

      // Validate all connectors have valid trading types
      data.connectors.forEach((connector: any) => {
        expect(connector.trading_types).toBeDefined();
        expect(Array.isArray(connector.trading_types)).toBe(true);
        expect(connector.trading_types.length).toBeGreaterThan(0);

        // All trading types should be valid
        connector.trading_types.forEach((type: string) => {
          expect(['router', 'amm', 'clmm']).toContain(type);
        });

        // No duplicates
        const uniqueTypes = [...new Set(connector.trading_types)];
        expect(uniqueTypes.length).toBe(connector.trading_types.length);
      });
    });
  });

  describe('Route Structure Validation', () => {
    it('should return 404 for unsupported trading type routes', async () => {
      // Get connector information
      const connectorsResponse = await fastify.inject({
        method: 'GET',
        url: '/connectors',
      });

      const { connectors } = JSON.parse(connectorsResponse.body);

      // Test that connectors without certain trading types return 404
      for (const connector of connectors) {
        const { name, trading_types } = connector;

        // Test router routes if not supported
        if (!trading_types.includes('router')) {
          const response = await fastify.inject({
            method: 'POST',
            url: `/connectors/${name}/router/quote`,
            payload: {
              chain: connector.chain,
              network: connector.networks[0],
              baseToken: 'TEST',
              quoteToken: 'TEST2',
              amount: 1,
              side: 'SELL',
            },
          });
          expect(response.statusCode).toBe(404);
        }

        // Test AMM routes if not supported
        if (!trading_types.includes('amm')) {
          const response = await fastify.inject({
            method: 'POST',
            url: `/connectors/${name}/amm/quote`,
            payload: {
              chain: connector.chain,
              network: connector.networks[0],
              baseToken: 'TEST',
              quoteToken: 'TEST2',
              amount: 1,
              side: 'SELL',
            },
          });
          expect(response.statusCode).toBe(404);
        }

        // Test CLMM routes if not supported
        if (!trading_types.includes('clmm')) {
          const response = await fastify.inject({
            method: 'POST',
            url: `/connectors/${name}/clmm/quote`,
            payload: {
              chain: connector.chain,
              network: connector.networks[0],
              baseToken: 'TEST',
              quoteToken: 'TEST2',
              amount: 1,
              side: 'SELL',
            },
          });
          expect(response.statusCode).toBe(404);
        }
      }
    });
  });
});

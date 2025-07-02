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
      const routes = fastify.printRoutes();

      // Remove whitespace and special characters for easier matching
      const cleanedRoutes = routes.replace(/\s+/g, ' ').replace(/[├└─│]/g, '');

      // For each connector, verify routes match their trading types
      connectors.forEach((connector: any) => {
        const { name, trading_types } = connector;

        // Check swap routes
        if (trading_types.includes('swap')) {
          // Swap routes should exist under /swap prefix
          expect(cleanedRoutes).toContain(`${name}/swap/`);
        } else {
          // No swap routes
          expect(cleanedRoutes).not.toContain(`${name}/swap/`);
        }

        // Check AMM routes
        if (trading_types.includes('amm')) {
          expect(cleanedRoutes).toContain(`${name}/amm/`);
        } else {
          expect(cleanedRoutes).not.toContain(`${name}/amm/`);
        }

        // Check CLMM routes
        if (trading_types.includes('clmm')) {
          expect(cleanedRoutes).toContain(`${name}/clmm/`);
        } else {
          expect(cleanedRoutes).not.toContain(`${name}/clmm/`);
        }
      });
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
          expect(['swap', 'amm', 'clmm']).toContain(type);
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

        // Test swap routes if not supported
        if (!trading_types.includes('swap')) {
          const response = await fastify.inject({
            method: 'POST',
            url: `/connectors/${name}/swap/quote`,
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

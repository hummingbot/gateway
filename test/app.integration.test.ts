import { FastifyInstance } from 'fastify';

// Mock dependencies before importing app
jest.mock('../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../src/services/config-manager-v2', () => ({
  ConfigManagerV2: {
    getInstance: jest.fn().mockReturnValue({
      get: jest.fn().mockImplementation((key: string) => {
        const mockConfig: Record<string, any> = {
          'server.port': 15888,
          'server.docsPort': 19999,
          'server.fastifyLogs': false,
        };
        return mockConfig[key];
      }),
    }),
  },
}));

jest.mock('../src/https', () => ({
  getHttpsOptions: jest.fn().mockReturnValue(null),
}));

import { gatewayApp } from '../src/app';

describe('App Integration - Route Registration', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
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

      // For each connector, verify routes match their trading types
      connectors.forEach((connector: any) => {
        const { name, trading_types } = connector;

        // Check swap routes
        if (trading_types.includes('swap')) {
          // Swap routes should exist under /swap prefix
          expect(routes).toContain(`/connectors/${name}/swap/`);
        } else {
          // No swap routes
          expect(routes).not.toContain(`/connectors/${name}/swap/`);
        }

        // Check AMM routes
        if (trading_types.includes('amm')) {
          expect(routes).toContain(`/connectors/${name}/amm/`);
        } else {
          expect(routes).not.toContain(`/connectors/${name}/amm/`);
        }

        // Check CLMM routes
        if (trading_types.includes('clmm')) {
          expect(routes).toContain(`/connectors/${name}/clmm/`);
        } else {
          expect(routes).not.toContain(`/connectors/${name}/clmm/`);
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

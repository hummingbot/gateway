import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../src/app';
import {
  getConnectorConfig,
  testConnectorRoutes,
  validateConnectorFolderStructure,
} from '../helpers/connector-test-utils';

// This test dynamically validates all connectors based on their declared trading types
describe('Generic Connector Validation', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('should validate all connectors have correct folder structure and routes', async () => {
    // Get all connectors
    const response = await fastify.inject({
      method: 'GET',
      url: '/connectors',
    });

    const { connectors } = JSON.parse(response.body);

    // Test each connector
    for (const connector of connectors) {
      const { name, trading_types } = connector;

      // Validate folder structure
      validateConnectorFolderStructure(name, trading_types);

      // Test routes match trading types
      await testConnectorRoutes({ name, fastify }, trading_types, connector);
    }
  });

  describe('Individual Connector Validation', () => {
    let connectorList: any[] = [];

    beforeAll(async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors',
      });
      connectorList = JSON.parse(response.body).connectors;
    });

    it('each connector should have valid configuration', () => {
      connectorList.forEach((connector) => {
        expect(connector.name).toBeDefined();
        expect(connector.trading_types).toBeDefined();
        expect(Array.isArray(connector.trading_types)).toBe(true);
        expect(connector.trading_types.length).toBeGreaterThan(0);
        expect(connector.chain).toBeDefined();
        expect(connector.networks).toBeDefined();
        expect(Array.isArray(connector.networks)).toBe(true);
        expect(connector.networks.length).toBeGreaterThan(0);
      });
    });

    it('no connector should have duplicate trading types', () => {
      connectorList.forEach((connector) => {
        const uniqueTypes = [...new Set(connector.trading_types)];
        expect(uniqueTypes.length).toBe(connector.trading_types.length);
      });
    });

    it('all trading types should be valid', () => {
      const validTypes = ['swap', 'amm', 'clmm'];
      connectorList.forEach((connector) => {
        connector.trading_types.forEach((type: string) => {
          expect(validTypes).toContain(type);
        });
      });
    });
  });
});

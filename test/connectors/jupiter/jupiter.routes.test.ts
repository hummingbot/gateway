import fs from 'fs';
import path from 'path';

import '../../mocks/app-mocks';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../../src/app';

describe('Jupiter Routes Structure', () => {
  const CONNECTOR_NAME = 'jupiter';
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('Folder Structure', () => {
    it('should have appropriate route folders based on trading types', async () => {
      // Get connector info
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors',
      });

      const { connectors } = JSON.parse(response.body);
      const jupiterConfig = connectors.find((c: any) => c.name === CONNECTOR_NAME);

      expect(jupiterConfig).toBeDefined();

      const connectorPath = path.join(__dirname, `../../../src/connectors/${CONNECTOR_NAME}`);

      // Check for router-routes if router is supported
      if (jupiterConfig.trading_types.includes('router')) {
        const routerRoutesPath = path.join(connectorPath, 'router-routes');
        expect(fs.existsSync(routerRoutesPath)).toBe(true);

        // Verify it has the standard router files
        const files = fs.readdirSync(routerRoutesPath);
        expect(files.some((f) => f.toLowerCase().includes('swap'))).toBe(true);
      }

      // Ensure old 'routes' folder doesn't exist
      const oldRoutesPath = path.join(connectorPath, 'routes');
      expect(fs.existsSync(oldRoutesPath)).toBe(false);
    });
  });

  describe('Route Registration', () => {
    it('should register Jupiter router routes at /connectors/jupiter/router', async () => {
      const routes = fastify.printRoutes();

      // Check that Jupiter router routes are registered
      expect(routes).toContain('jupiter/router/');
      expect(routes).toContain('quote-swap');
      expect(routes).toContain('execute-swap');
    });
  });
});

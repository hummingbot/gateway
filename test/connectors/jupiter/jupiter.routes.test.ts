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
      const jupiterConfig = connectors.find(
        (c: any) => c.name === CONNECTOR_NAME,
      );

      expect(jupiterConfig).toBeDefined();

      const connectorPath = path.join(
        __dirname,
        `../../../src/connectors/${CONNECTOR_NAME}`,
      );

      // Check for swap-routes if swap is supported
      if (jupiterConfig.trading_types.includes('swap')) {
        const swapRoutesPath = path.join(connectorPath, 'swap-routes');
        expect(fs.existsSync(swapRoutesPath)).toBe(true);

        // Verify it has the standard swap files
        const files = fs.readdirSync(swapRoutesPath);
        expect(files.some((f) => f.includes('Swap'))).toBe(true);
      }

      // Ensure old 'routes' folder doesn't exist
      const oldRoutesPath = path.join(connectorPath, 'routes');
      expect(fs.existsSync(oldRoutesPath)).toBe(false);
    });
  });

  describe('Route Registration', () => {
    it('should register Jupiter swap routes at /connectors/jupiter/swap', async () => {
      const routes = fastify.printRoutes();

      // Check that Jupiter swap routes are registered
      expect(routes).toContain('jupiter/swap/');
      expect(routes).toContain('quote-swap');
      expect(routes).toContain('execute-swap');
    });
  });
});

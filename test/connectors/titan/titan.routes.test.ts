import fs from 'fs';
import path from 'path';

import '../../mocks/app-mocks';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../../src/app';

describe('Titan Routes Structure', () => {
  const CONNECTOR_NAME = 'titan';
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
      const response = await fastify.inject({
        method: 'GET',
        url: '/config/connectors',
      });

      const { connectors } = JSON.parse(response.body);
      const titanConfig = connectors.find((c: any) => c.name === CONNECTOR_NAME);

      expect(titanConfig).toBeDefined();
      expect(titanConfig.chain).toBe('solana');
      expect(titanConfig.trading_types).toEqual(['router']);
      expect(titanConfig.networks).toEqual(['mainnet-beta']);

      const connectorPath = path.join(__dirname, `../../../src/connectors/${CONNECTOR_NAME}`);
      const routerRoutesPath = path.join(connectorPath, 'router-routes');
      expect(fs.existsSync(routerRoutesPath)).toBe(true);

      const files = fs.readdirSync(routerRoutesPath);
      expect(files.some((f) => f.toLowerCase().includes('swap'))).toBe(true);
    });
  });

  describe('Route Registration', () => {
    it('should register Titan router routes at /connectors/titan/router', async () => {
      const routes = fastify.printRoutes();

      expect(routes).toContain('titan/router/');
      expect(routes).toContain('quote-swap');
      expect(routes).toContain('execute-swap');
    });
  });
});

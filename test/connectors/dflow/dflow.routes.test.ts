import fs from 'fs';
import path from 'path';

import '../../mocks/app-mocks';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../../src/app';

describe('DFlow Routes Structure', () => {
  const CONNECTOR_NAME = 'dflow';
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
      const dflowConfig = connectors.find((c: any) => c.name === CONNECTOR_NAME);

      expect(dflowConfig).toBeDefined();
      expect(dflowConfig.chain).toBe('solana');
      expect(dflowConfig.trading_types).toEqual(['router']);
      expect(dflowConfig.networks).toEqual(['mainnet-beta']);

      const connectorPath = path.join(__dirname, `../../../src/connectors/${CONNECTOR_NAME}`);
      const routerRoutesPath = path.join(connectorPath, 'router-routes');
      expect(fs.existsSync(routerRoutesPath)).toBe(true);

      const files = fs.readdirSync(routerRoutesPath);
      expect(files.some((f) => f.toLowerCase().includes('swap'))).toBe(true);
    });
  });

  describe('Route Registration', () => {
    it('should register DFlow router routes at /connectors/dflow/router', async () => {
      const routes = fastify.printRoutes();

      expect(routes).toContain('dflow/router/');
      expect(routes).toContain('quote-swap');
      expect(routes).toContain('execute-swap');
    });
  });
});

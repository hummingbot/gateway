import fs from 'fs';
import path from 'path';

import '../../mocks/app-mocks';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../../src/app';

describe('OKX Routes Structure', () => {
  const CONNECTOR_NAME = 'okx';
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
      const okxConfig = connectors.find((c: any) => c.name === CONNECTOR_NAME);

      expect(okxConfig).toBeDefined();
      expect(okxConfig.chain).toBe('solana');
      expect(okxConfig.trading_types).toEqual(['router']);
      expect(okxConfig.networks).toEqual(['mainnet-beta']);

      const connectorPath = path.join(__dirname, `../../../src/connectors/${CONNECTOR_NAME}`);
      const routerRoutesPath = path.join(connectorPath, 'router-routes');
      expect(fs.existsSync(routerRoutesPath)).toBe(true);

      const files = fs.readdirSync(routerRoutesPath);
      expect(files.some((f) => f.toLowerCase().includes('swap'))).toBe(true);
    });
  });

  describe('Route Registration', () => {
    it('should register OKX router routes at /connectors/okx/router', async () => {
      // printRoutes compresses shared prefixes (okx/orca), so probe the routes directly:
      // a registered route responds with validation/handler errors, an absent one with 404
      const quoteSwap = await fastify.inject({ method: 'GET', url: '/connectors/okx/router/quote-swap' });
      expect(quoteSwap.statusCode).not.toBe(404);

      const executeSwap = await fastify.inject({ method: 'POST', url: '/connectors/okx/router/execute-swap' });
      expect(executeSwap.statusCode).not.toBe(404);
    });
  });
});

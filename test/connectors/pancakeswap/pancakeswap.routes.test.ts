import fs from 'fs';
import path from 'path';

import '../../mocks/app-mocks';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../../src/app';

describe('Pancakeswap Routes Structure', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('Folder Structure', () => {
    it('should have router-routes, amm-routes, and clmm-routes folders', () => {
      const pancakeswapPath = path.join(__dirname, '../../../src/connectors/pancakeswap');
      const routerRoutesPath = path.join(pancakeswapPath, 'router-routes');
      const ammRoutesPath = path.join(pancakeswapPath, 'amm-routes');
      const clmmRoutesPath = path.join(pancakeswapPath, 'clmm-routes');
      const oldRoutesPath = path.join(pancakeswapPath, 'routes');

      expect(fs.existsSync(routerRoutesPath)).toBe(true);
      expect(fs.existsSync(ammRoutesPath)).toBe(true);
      expect(fs.existsSync(clmmRoutesPath)).toBe(true);
      expect(fs.existsSync(oldRoutesPath)).toBe(false);
    });

    it('should have correct files in router-routes folder', () => {
      const routerRoutesPath = path.join(__dirname, '../../../src/connectors/pancakeswap/router-routes');
      const files = fs.readdirSync(routerRoutesPath);

      expect(files).toContain('executeSwap.ts');
      expect(files).toContain('quoteSwap.ts');
      expect(files).toContain('executeQuote.ts');
    });
  });

  describe('Route Registration', () => {
    it('should register all Pancakeswap route types', async () => {
      // Verify routes are registered by checking they return non-404 responses
      // (they may return 400 for missing params, but 404 means route doesn't exist)

      // Check router route
      const routerResponse = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/router/quote-swap',
      });
      expect(routerResponse.statusCode).not.toBe(404);

      // Check AMM route
      const ammResponse = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/amm/pool-info',
      });
      expect(ammResponse.statusCode).not.toBe(404);

      // Check CLMM route
      const clmmResponse = await fastify.inject({
        method: 'GET',
        url: '/connectors/pancakeswap/clmm/pool-info',
      });
      expect(clmmResponse.statusCode).not.toBe(404);
    });
  });
});

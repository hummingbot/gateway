import fs from 'fs';
import path from 'path';

import '../../mocks/app-mocks';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../../src/app';

describe('Uniswap Routes Structure', () => {
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
      const uniswapPath = path.join(__dirname, '../../../src/connectors/uniswap');
      const routerRoutesPath = path.join(uniswapPath, 'router-routes');
      const ammRoutesPath = path.join(uniswapPath, 'amm-routes');
      const clmmRoutesPath = path.join(uniswapPath, 'clmm-routes');
      const oldRoutesPath = path.join(uniswapPath, 'routes');

      expect(fs.existsSync(routerRoutesPath)).toBe(true);
      expect(fs.existsSync(ammRoutesPath)).toBe(true);
      expect(fs.existsSync(clmmRoutesPath)).toBe(true);
      expect(fs.existsSync(oldRoutesPath)).toBe(false);
    });

    it('should have correct files in router-routes folder', () => {
      const routerRoutesPath = path.join(__dirname, '../../../src/connectors/uniswap/router-routes');
      const files = fs.readdirSync(routerRoutesPath);

      expect(files).toContain('executeSwap.ts');
      expect(files).toContain('quoteSwap.ts');
      expect(files).toContain('executeQuote.ts');
    });
  });

  describe('Route Registration', () => {
    it('should register all Uniswap route types', async () => {
      const routes = fastify.printRoutes();

      // Check that Uniswap router routes are registered
      expect(routes).toContain('uniswap/');
      expect(routes).toContain('router/');

      // Check that Uniswap AMM routes are registered
      expect(routes).toContain('amm/');

      // Check that Uniswap CLMM routes are registered
      expect(routes).toContain('clmm/');
    });
  });
});

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
      const routes = fastify.printRoutes();

      // Check that Pancakeswap routes are registered (both EVM and Solana)
      expect(routes).toContain('pancakeswap');
      expect(routes).toContain('router/');

      // Check that Pancakeswap AMM routes are registered
      expect(routes).toContain('amm/');

      // Check that Pancakeswap CLMM routes are registered
      expect(routes).toContain('clmm/');
    });
  });
});

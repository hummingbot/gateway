import fs from 'fs';
import path from 'path';

import '../../mocks/app-mocks';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../../src/app';

describe('Uniswap Routes Structure', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('Folder Structure', () => {
    it('should have swap-routes, amm-routes, and clmm-routes folders', () => {
      const uniswapPath = path.join(
        __dirname,
        '../../../src/connectors/uniswap',
      );
      const swapRoutesPath = path.join(uniswapPath, 'swap-routes');
      const ammRoutesPath = path.join(uniswapPath, 'amm-routes');
      const clmmRoutesPath = path.join(uniswapPath, 'clmm-routes');
      const oldRoutesPath = path.join(uniswapPath, 'routes');

      expect(fs.existsSync(swapRoutesPath)).toBe(true);
      expect(fs.existsSync(ammRoutesPath)).toBe(true);
      expect(fs.existsSync(clmmRoutesPath)).toBe(true);
      expect(fs.existsSync(oldRoutesPath)).toBe(false);
    });

    it('should have correct files in swap-routes folder', () => {
      const swapRoutesPath = path.join(
        __dirname,
        '../../../src/connectors/uniswap/swap-routes',
      );
      const files = fs.readdirSync(swapRoutesPath);

      expect(files).toContain('execute-swap.ts');
      expect(files).toContain('quote-swap.ts');
    });
  });

  describe('Route Registration', () => {
    it('should register all Uniswap route types', async () => {
      const routes = fastify.printRoutes();

      // Check that Uniswap swap routes are registered
      expect(routes).toContain('uniswap/');
      expect(routes).toContain('swap/');

      // Check that Uniswap AMM routes are registered
      expect(routes).toContain('amm/');

      // Check that Uniswap CLMM routes are registered
      expect(routes).toContain('clmm/');
    });
  });
});

import fs from 'fs';
import path from 'path';

import '../../mocks/app-mocks';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../../src/app';

describe('Raydium Routes Structure', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('Folder Structure', () => {
    it('should only have amm-routes and clmm-routes folders', () => {
      const raydiumPath = path.join(
        __dirname,
        '../../../src/connectors/raydium',
      );
      const ammRoutesPath = path.join(raydiumPath, 'amm-routes');
      const clmmRoutesPath = path.join(raydiumPath, 'clmm-routes');
      const swapRoutesPath = path.join(raydiumPath, 'swap-routes');
      const routesPath = path.join(raydiumPath, 'routes');

      expect(fs.existsSync(ammRoutesPath)).toBe(true);
      expect(fs.existsSync(clmmRoutesPath)).toBe(true);
      expect(fs.existsSync(swapRoutesPath)).toBe(false);
      expect(fs.existsSync(routesPath)).toBe(false);
    });

    it('should have swap endpoints within AMM routes', () => {
      const ammRoutesPath = path.join(
        __dirname,
        '../../../src/connectors/raydium/amm-routes',
      );
      const files = fs.readdirSync(ammRoutesPath);

      expect(files).toContain('executeSwap.ts');
      expect(files).toContain('quoteSwap.ts');
    });

    it('should have swap endpoints within CLMM routes', () => {
      const clmmRoutesPath = path.join(
        __dirname,
        '../../../src/connectors/raydium/clmm-routes',
      );
      const files = fs.readdirSync(clmmRoutesPath);

      expect(files).toContain('executeSwap.ts');
      expect(files).toContain('quoteSwap.ts');
    });
  });

  describe('Route Registration', () => {
    it('should register Raydium AMM and CLMM routes', async () => {
      const routes = fastify.printRoutes();

      // Check that Raydium AMM routes are registered
      expect(routes).toContain('raydium/');
      expect(routes).toContain('amm/');

      // Check that Raydium CLMM routes are registered
      expect(routes).toContain('clmm/');

      // Check that swap routes are NOT directly under /swap
      expect(routes).not.toContain('raydium/swap/');
    });
  });
});

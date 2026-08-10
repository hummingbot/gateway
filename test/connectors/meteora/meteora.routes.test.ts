import fs from 'fs';
import path from 'path';

import '../../mocks/app-mocks';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../../src/app';

describe('Meteora Routes Structure', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('Folder Structure', () => {
    it('should have clmm-routes (DLMM) and amm-routes (DAMM v2) folders', () => {
      const meteoraPath = path.join(__dirname, '../../../src/connectors/meteora');
      const clmmRoutesPath = path.join(meteoraPath, 'clmm-routes');
      const ammRoutesPath = path.join(meteoraPath, 'amm-routes');
      const swapRoutesPath = path.join(meteoraPath, 'swap-routes');
      const routesPath = path.join(meteoraPath, 'routes');

      expect(fs.existsSync(clmmRoutesPath)).toBe(true);
      expect(fs.existsSync(ammRoutesPath)).toBe(true);
      expect(fs.existsSync(swapRoutesPath)).toBe(false);
      expect(fs.existsSync(routesPath)).toBe(false);
    });

    it('should have swap endpoints within CLMM routes', () => {
      const clmmRoutesPath = path.join(__dirname, '../../../src/connectors/meteora/clmm-routes');
      const files = fs.readdirSync(clmmRoutesPath);

      expect(files).toContain('executeSwap.ts');
      expect(files).toContain('quoteSwap.ts');
    });
  });

  describe('Route Registration', () => {
    it('should register Meteora CLMM (DLMM) and AMM (DAMM v2) routes', async () => {
      // commonPrefix:false prints full paths (no radix-tree prefix collapsing).
      const routes = fastify.printRoutes({ commonPrefix: false });

      // Check that Meteora CLMM routes are registered
      expect(routes).toContain('meteora/clmm/');

      // Check that Meteora AMM (DAMM v2) routes are registered
      expect(routes).toContain('meteora/amm/');

      // Check that swap routes are NOT directly under /swap
      expect(routes).not.toContain('meteora/swap/');
    });
  });
});

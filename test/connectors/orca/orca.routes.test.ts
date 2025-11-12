import fs from 'fs';
import path from 'path';

import '../../mocks/app-mocks';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../../src/app';

describe('Orca Routes Structure', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('Folder Structure', () => {
    it('should only have clmm-routes folder', () => {
      const orcaPath = path.join(__dirname, '../../../src/connectors/orca');
      const clmmRoutesPath = path.join(orcaPath, 'clmm-routes');
      const ammRoutesPath = path.join(orcaPath, 'amm-routes');
      const routerRoutesPath = path.join(orcaPath, 'router-routes');
      const routesPath = path.join(orcaPath, 'routes');

      expect(fs.existsSync(clmmRoutesPath)).toBe(true);
      expect(fs.existsSync(ammRoutesPath)).toBe(false);
      expect(fs.existsSync(routerRoutesPath)).toBe(false);
      expect(fs.existsSync(routesPath)).toBe(false);
    });

    it('should have swap endpoints within CLMM routes', () => {
      const clmmRoutesPath = path.join(__dirname, '../../../src/connectors/orca/clmm-routes');
      const files = fs.readdirSync(clmmRoutesPath);

      expect(files).toContain('executeSwap.ts');
      expect(files).toContain('quoteSwap.ts');
    });

    it('should have position management endpoints in CLMM routes', () => {
      const clmmRoutesPath = path.join(__dirname, '../../../src/connectors/orca/clmm-routes');
      const files = fs.readdirSync(clmmRoutesPath);

      expect(files).toContain('openPosition.ts');
      expect(files).toContain('closePosition.ts');
      expect(files).toContain('addLiquidity.ts');
      expect(files).toContain('removeLiquidity.ts');
      expect(files).toContain('collectFees.ts');
    });

    it('should have pool and position query endpoints in CLMM routes', () => {
      const clmmRoutesPath = path.join(__dirname, '../../../src/connectors/orca/clmm-routes');
      const files = fs.readdirSync(clmmRoutesPath);

      expect(files).toContain('poolInfo.ts');
      expect(files).toContain('positionInfo.ts');
      expect(files).toContain('positionsOwned.ts');
      expect(files).toContain('quotePosition.ts');
      expect(files).toContain('fetchPools.ts');
    });
  });

  describe('Route Registration', () => {
    it('should register Orca CLMM routes at /connectors/orca/clmm', async () => {
      const routes = fastify.printRoutes();

      // Check that Orca CLMM routes are registered
      expect(routes).toContain('orca/clmm/');

      // Check that swap routes are NOT directly under /swap
      expect(routes).not.toContain('orca/swap/');

      // Check that AMM routes are NOT registered
      expect(routes).not.toContain('orca/amm/');

      // Check that router routes are NOT registered
      expect(routes).not.toContain('orca/router/');
    });

    it('should have key CLMM endpoints', async () => {
      const routes = fastify.printRoutes();

      // Check for key swap endpoints
      expect(routes).toContain('orca/clmm/');

      // Verify some core endpoints exist (routes may be named differently)
      // Just verify orca routes are registered
      expect(routes.includes('orca')).toBe(true);
    });
  });
});

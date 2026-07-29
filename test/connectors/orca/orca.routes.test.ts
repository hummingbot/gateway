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
      // printRoutes compresses shared prefixes (okx/orca), so probe the routes directly:
      // a registered route responds with validation/handler errors, an absent one with 404
      const clmmRoute = await fastify.inject({ method: 'GET', url: '/connectors/orca/clmm/pool-info' });
      expect(clmmRoute.statusCode).not.toBe(404);

      // Check that AMM and router routes are NOT registered
      const ammRoute = await fastify.inject({ method: 'GET', url: '/connectors/orca/amm/pool-info' });
      expect(ammRoute.statusCode).toBe(404);

      const routerRoute = await fastify.inject({ method: 'GET', url: '/connectors/orca/router/quote-swap' });
      expect(routerRoute.statusCode).toBe(404);
    });

    it('should have key CLMM endpoints', async () => {
      const quoteSwap = await fastify.inject({ method: 'GET', url: '/connectors/orca/clmm/quote-swap' });
      expect(quoteSwap.statusCode).not.toBe(404);

      const executeSwap = await fastify.inject({ method: 'POST', url: '/connectors/orca/clmm/execute-swap' });
      expect(executeSwap.statusCode).not.toBe(404);
    });
  });
});

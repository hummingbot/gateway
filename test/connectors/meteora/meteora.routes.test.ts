import fs from 'fs';
import path from 'path';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../../src/app';

describe('Meteora Routes Structure', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('Folder Structure', () => {
    it('should only have clmm-routes folder', () => {
      const meteoraPath = path.join(__dirname, '../../../src/connectors/meteora');
      const clmmRoutesPath = path.join(meteoraPath, 'clmm-routes');
      const ammRoutesPath = path.join(meteoraPath, 'amm-routes');
      const swapRoutesPath = path.join(meteoraPath, 'swap-routes');
      const routesPath = path.join(meteoraPath, 'routes');

      expect(fs.existsSync(clmmRoutesPath)).toBe(true);
      expect(fs.existsSync(ammRoutesPath)).toBe(false);
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
    it('should register Meteora CLMM routes at /connectors/meteora/clmm', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/connectors/meteora/clmm/quote',
        payload: {
          chain: 'solana',
          network: 'mainnet-beta',
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 1,
          side: 'SELL',
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should NOT have direct swap routes at /connectors/meteora', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/connectors/meteora/quote',
        payload: {
          chain: 'solana',
          network: 'mainnet-beta',
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 1,
          side: 'SELL',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should NOT have AMM routes', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/connectors/meteora/amm/quote',
        payload: {
          chain: 'solana',
          network: 'mainnet-beta',
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 1,
          side: 'SELL',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
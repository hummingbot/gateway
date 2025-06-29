import fs from 'fs';
import path from 'path';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../../src/app';

describe('Raydium Routes Structure', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('Folder Structure', () => {
    it('should only have amm-routes and clmm-routes folders', () => {
      const raydiumPath = path.join(__dirname, '../../../src/connectors/raydium');
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
      const ammRoutesPath = path.join(__dirname, '../../../src/connectors/raydium/amm-routes');
      const files = fs.readdirSync(ammRoutesPath);

      expect(files).toContain('executeSwap.ts');
      expect(files).toContain('quoteSwap.ts');
    });

    it('should have swap endpoints within CLMM routes', () => {
      const clmmRoutesPath = path.join(__dirname, '../../../src/connectors/raydium/clmm-routes');
      const files = fs.readdirSync(clmmRoutesPath);

      expect(files).toContain('executeSwap.ts');
      expect(files).toContain('quoteSwap.ts');
    });
  });

  describe('Route Registration', () => {
    it('should register Raydium AMM routes at /connectors/raydium/amm', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/connectors/raydium/amm/quote',
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

    it('should register Raydium CLMM routes at /connectors/raydium/clmm', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/connectors/raydium/clmm/quote',
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

    it('should NOT have direct swap routes at /connectors/raydium', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/connectors/raydium/quote',
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
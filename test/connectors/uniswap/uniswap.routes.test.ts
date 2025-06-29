import fs from 'fs';
import path from 'path';

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
      const uniswapPath = path.join(__dirname, '../../../src/connectors/uniswap');
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
      const swapRoutesPath = path.join(__dirname, '../../../src/connectors/uniswap/swap-routes');
      const files = fs.readdirSync(swapRoutesPath);

      expect(files).toContain('execute-swap.ts');
      expect(files).toContain('quote-swap.ts');
    });
  });

  describe('Route Registration', () => {
    it('should register Uniswap swap routes at /connectors/uniswap', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/connectors/uniswap/quote',
        payload: {
          chain: 'ethereum',
          network: 'mainnet',
          baseToken: 'ETH',
          quoteToken: 'USDC',
          amount: 1,
          side: 'SELL',
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should register Uniswap AMM routes at /connectors/uniswap/amm', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/connectors/uniswap/amm/poolInfo',
        payload: {
          chain: 'ethereum',
          network: 'mainnet',
          baseToken: 'ETH',
          quoteToken: 'USDC',
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should register Uniswap CLMM routes at /connectors/uniswap/clmm', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/connectors/uniswap/clmm/poolInfo',
        payload: {
          chain: 'ethereum',
          network: 'mainnet',
          baseToken: 'ETH',
          quoteToken: 'USDC',
          fee: 'MEDIUM',
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });
});
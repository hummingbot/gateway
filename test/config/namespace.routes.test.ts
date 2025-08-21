import '../mocks/app-mocks';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../src/app';

describe('Namespace Routes', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('GET /namespaces', () => {
    it('should return the list of all namespaces', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/config/namespaces',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toHaveProperty('namespaces');
      expect(Array.isArray(data.namespaces)).toBe(true);
      expect(data.namespaces.length).toBeGreaterThan(0);

      // Each namespace should be a string
      data.namespaces.forEach((namespace: any) => {
        expect(typeof namespace).toBe('string');
      });

      // Check for some expected namespaces
      expect(data.namespaces).toContain('server');
      expect(data.namespaces).toContain('ethereum-mainnet');
      expect(data.namespaces).toContain('solana-mainnet-beta');
      expect(data.namespaces).toContain('uniswap');
      expect(data.namespaces).toContain('jupiter');
    });

    it('should return namespaces sorted alphabetically', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/config/namespaces',
      });

      const data = JSON.parse(response.body);
      const namespaces = data.namespaces;

      // Check that namespaces are sorted alphabetically
      for (let i = 1; i < namespaces.length; i++) {
        expect(namespaces[i].localeCompare(namespaces[i - 1])).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

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
        url: '/namespaces',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      
      expect(data).toHaveProperty('namespaces');
      expect(Array.isArray(data.namespaces)).toBe(true);
      expect(data.namespaces.length).toBeGreaterThan(0);
      
      // Each namespace should have id and type
      data.namespaces.forEach((namespace: any) => {
        expect(namespace).toHaveProperty('id');
        expect(namespace).toHaveProperty('type');
        expect(typeof namespace.id).toBe('string');
        expect(['server', 'network', 'connector', 'other']).toContain(namespace.type);
      });
      
      // Check for some expected namespaces
      const namespaceIds = data.namespaces.map((n: any) => n.id);
      expect(namespaceIds).toContain('server');
      expect(namespaceIds).toContain('ethereum-mainnet');
      expect(namespaceIds).toContain('solana-mainnet-beta');
      expect(namespaceIds).toContain('uniswap');
      expect(namespaceIds).toContain('jupiter');
      
      // Check types are correct
      const serverNamespace = data.namespaces.find((n: any) => n.id === 'server');
      expect(serverNamespace?.type).toBe('server');
      
      const ethereumMainnet = data.namespaces.find((n: any) => n.id === 'ethereum-mainnet');
      expect(ethereumMainnet?.type).toBe('network');
      
      const uniswap = data.namespaces.find((n: any) => n.id === 'uniswap');
      expect(uniswap?.type).toBe('connector');
    });

    it('should return namespaces sorted by type and id', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/namespaces',
      });

      const data = JSON.parse(response.body);
      const namespaces = data.namespaces;
      
      // Check that server type comes first
      const firstServerIndex = namespaces.findIndex((n: any) => n.type === 'server');
      const firstNetworkIndex = namespaces.findIndex((n: any) => n.type === 'network');
      const firstConnectorIndex = namespaces.findIndex((n: any) => n.type === 'connector');
      
      if (firstServerIndex !== -1 && firstNetworkIndex !== -1) {
        expect(firstServerIndex).toBeLessThan(firstNetworkIndex);
      }
      if (firstNetworkIndex !== -1 && firstConnectorIndex !== -1) {
        expect(firstNetworkIndex).toBeLessThan(firstConnectorIndex);
      }
      
      // Check that within each type, namespaces are sorted alphabetically
      for (let i = 1; i < namespaces.length; i++) {
        if (namespaces[i].type === namespaces[i-1].type) {
          expect(namespaces[i].id.localeCompare(namespaces[i-1].id)).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });
});
import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../src/app';

describe('Connector Routes', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('GET /connectors', () => {
    it('should return the correct list of connectors with proper trading types', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/connectors',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      
      expect(data).toHaveProperty('connectors');
      expect(Array.isArray(data.connectors)).toBe(true);
      expect(data.connectors.length).toBeGreaterThan(0);

      // Verify each connector has required fields
      data.connectors.forEach((connector: any) => {
        expect(connector).toHaveProperty('name');
        expect(connector).toHaveProperty('trading_types');
        expect(connector).toHaveProperty('chain');
        expect(connector).toHaveProperty('networks');
        
        // Verify trading_types is an array with valid values
        expect(Array.isArray(connector.trading_types)).toBe(true);
        expect(connector.trading_types.length).toBeGreaterThan(0);
        connector.trading_types.forEach((type: string) => {
          expect(['swap', 'amm', 'clmm']).toContain(type);
        });
        
        // Verify chain is valid
        expect(['ethereum', 'solana']).toContain(connector.chain);
        
        // Verify networks is an array
        expect(Array.isArray(connector.networks)).toBe(true);
        expect(connector.networks.length).toBeGreaterThan(0);
      });

      // Test some known connectors exist (but don't enforce exact count or trading types)
      const connectorNames = data.connectors.map((c: any) => c.name);
      expect(connectorNames).toContain('jupiter');
      expect(connectorNames).toContain('uniswap');
    });
  });
});
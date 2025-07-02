import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import '../mocks/app-mocks';

import { gatewayApp } from '../../src/app';

describe('Chain Routes', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('GET /chains', () => {
    it('should return the list of supported chains and networks', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/chains',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toHaveProperty('chains');
      expect(Array.isArray(data.chains)).toBe(true);

      // Check that we have both ethereum and solana chains
      const chainNames = data.chains.map((c: any) => c.chain);
      expect(chainNames).toContain('ethereum');
      expect(chainNames).toContain('solana');

      // Each chain should have networks array
      data.chains.forEach((chain: any) => {
        expect(chain).toHaveProperty('chain');
        expect(chain).toHaveProperty('networks');
        expect(Array.isArray(chain.networks)).toBe(true);
      });

      // Verify ethereum networks
      const ethereum = data.chains.find((c: any) => c.chain === 'ethereum');
      expect(ethereum.networks.length).toBeGreaterThan(0);
      expect(ethereum.networks).toContain('mainnet');

      // Verify solana networks
      const solana = data.chains.find((c: any) => c.chain === 'solana');
      expect(solana.networks.length).toBeGreaterThan(0);
      expect(solana.networks).toContain('mainnet-beta');
    });
  });
});

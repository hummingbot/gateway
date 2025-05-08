jest.mock('../../src/services/logger');

const request = require('supertest');
const { gatewayApp } = require('../../src/app');
const { ConfigManagerV2 } = require('../../src/services/config-manager-v2');

describe('Chain Routes', () => {
  it('GET /chains - should return available chains and their networks', async () => {
    const response = await request(gatewayApp.server)
      .get('/chains')
      .expect(200);

    expect(response.body).toHaveProperty('chains');
    expect(Array.isArray(response.body.chains)).toBe(true);
    
    // Should at least have ethereum and solana
    expect(response.body.chains.length).toBeGreaterThanOrEqual(2);
    
    // Check structure of returned chains
    const chains = response.body.chains;
    for (const chain of chains) {
      expect(chain).toHaveProperty('chain');
      expect(chain).toHaveProperty('networks');
      expect(Array.isArray(chain.networks)).toBe(true);
      expect(chain.networks.length).toBeGreaterThan(0);
    }
    
    // Verify ethereum and solana are included
    const ethereumChain = chains.find(c => c.chain === 'ethereum');
    const solanaChain = chains.find(c => c.chain === 'solana');
    
    expect(ethereumChain).toBeDefined();
    expect(solanaChain).toBeDefined();
    
    // Verify networks in chains
    expect(ethereumChain.networks).toContain('mainnet');
    expect(solanaChain.networks).toContain('mainnet-beta');
  });
});
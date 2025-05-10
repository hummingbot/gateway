jest.mock('../../src/services/logger');

// Update to use the Jest testing framework directly instead of supertest
const { ConfigManagerV2 } = require('../../src/services/config-manager-v2');

describe('Chain Routes', () => {
  it('should validate chain support for ethereum and solana', async () => {
    // Get ethereum networks directly from ConfigManagerV2
    const ethereumNetworks = Object.keys(
      ConfigManagerV2.getInstance().get('ethereum.networks') || {}
    );

    // Get Solana networks directly from ConfigManagerV2
    const solanaNetworks = Object.keys(
      ConfigManagerV2.getInstance().get('solana.networks') || {}
    );

    // Verify we have networks for both chains
    expect(ethereumNetworks.length).toBeGreaterThan(0);
    expect(solanaNetworks.length).toBeGreaterThan(0);

    // Verify expected networks exist
    expect(ethereumNetworks).toContain('mainnet');
    expect(solanaNetworks).toContain('mainnet-beta');
  });
});
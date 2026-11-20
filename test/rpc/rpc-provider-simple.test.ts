// The config manager is stubbed with a fixture: these tests are about which namespace each
// field is read from, not about any particular deployment's conf/.
const mockConfig: Record<string, unknown> = {};

jest.mock('../../src/services/config-manager-v2', () => ({
  ConfigManagerV2: {
    getInstance: () => ({ get: (key: string) => mockConfig[key] }),
  },
}));

import { getSolanaChainConfig, getSolanaNetworkConfig } from '../../src/chains/solana/solana.config';

describe('Solana RPC provider configuration', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockConfig)) delete mockConfig[key];
    Object.assign(mockConfig, {
      'solana.rpcProvider': 'helius',
      'solana-mainnet-beta.nodeURL': 'https://api.mainnet-beta.solana.com',
      'solana-mainnet-beta.rpcProvider': 'url',
      'solana-devnet.nodeURL': 'https://api.devnet.solana.com',
    });
  });

  it('reads rpcProvider from the chain namespace, not from a network', () => {
    expect(getSolanaChainConfig().rpcProvider).toBe('helius');
    expect(getSolanaNetworkConfig('mainnet-beta')).not.toHaveProperty('rpcProvider');
  });

  it('defaults rpcProvider to "url" when the chain names none', () => {
    delete mockConfig['solana.rpcProvider'];
    expect(getSolanaChainConfig().rpcProvider).toBe('url');
  });

  it("reads each network's nodeURL from that network's namespace", () => {
    expect(getSolanaNetworkConfig('mainnet-beta').nodeURL).toBe('https://api.mainnet-beta.solana.com');
    expect(getSolanaNetworkConfig('devnet').nodeURL).toBe('https://api.devnet.solana.com');
  });
});

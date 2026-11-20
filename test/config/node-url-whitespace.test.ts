// A nodeURL that was saved with surrounding whitespace - pasted into the YAML by hand, or
// written through /config/update before it trimmed - passes the JSON schema, which only
// asks for a string, and then fails inside the RPC client: Solana's Connection rejects
// ' https://...' with "Endpoint URL must start with `http:` or `https:`" on the first
// wallet or balance call. The chain config loaders are where every consumer reads the
// value, so the trim there covers a config that is already on disk.
jest.mock('../../src/services/config-manager-v2', () => {
  const CONFIG: Record<string, unknown> = {
    'solana-mainnet-beta.chainID': 101,
    'solana-mainnet-beta.nodeURL': ' https://api.mainnet-beta.solana.com',
    'solana-mainnet-beta.nativeCurrencySymbol': 'SOL',
    'solana-mainnet-beta.geckoId': 'solana',

    'ethereum-mainnet.chainID': 1,
    'ethereum-mainnet.nodeURL': 'https://mainnet.infura.io/v3/xxx\n',
    'ethereum-mainnet.nativeCurrencySymbol': 'ETH',
    'ethereum-mainnet.geckoId': 'eth',
  };

  return {
    ConfigManagerV2: {
      getInstance: () => ({
        get: (key: string) => CONFIG[key],
        getSupportedChainNetworks: () => ['solana-mainnet-beta', 'ethereum-mainnet'],
      }),
    },
  };
});

import { getEthereumNetworkConfig } from '../../src/chains/ethereum/ethereum.config';
import { getSolanaNetworkConfig } from '../../src/chains/solana/solana.config';

describe('nodeURL saved with surrounding whitespace', () => {
  it('is read without the leading space on Solana', () => {
    expect(getSolanaNetworkConfig('mainnet-beta').nodeURL).toBe('https://api.mainnet-beta.solana.com');
  });

  it('is read without the trailing newline on Ethereum', () => {
    expect(getEthereumNetworkConfig('mainnet').nodeURL).toBe('https://mainnet.infura.io/v3/xxx');
  });
});

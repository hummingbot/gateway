jest.mock('../../../src/services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  redactUrl: jest.fn((url: string) => url),
}));

let infuraKey = '';

jest.mock('../../../src/services/config-manager-v2', () => ({
  ConfigManagerV2: {
    getInstance: jest.fn(() => ({
      get: jest.fn((key: string) => {
        if (key === 'apiKeys.infura') return infuraKey;
        if (key === 'solana.defaultNetwork') return 'mainnet-beta';
        if (key === 'solana.defaultWallet') return 'test-wallet';
        if (key === 'solana.rpcProvider') return 'infura';
        if (key === 'solana-mainnet-beta.nodeURL') return 'https://api.mainnet-beta.solana.com';
        if (key === 'solana-mainnet-beta.nativeCurrencySymbol') return 'SOL';
        if (key === 'solana-mainnet-beta.defaultComputeUnits') return 200000;
        if (key === 'solana-mainnet-beta.confirmRetryInterval') return 2;
        if (key === 'solana-mainnet-beta.confirmRetryCount') return 30;
        if (key === 'solana-mainnet-beta.minPriorityFeePerCU') return 0;
        return undefined;
      }),
    })),
  },
}));

import { Solana } from '../../../src/chains/solana/solana';
import { InfuraSolanaService } from '../../../src/rpc/infura-solana-service';

describe('Solana with rpcProvider: infura', () => {
  beforeEach(() => {
    (Solana as any)._instances = {};
  });

  it('connects to the Infura Solana endpoint built from apiKeys.infura', async () => {
    infuraKey = 'test-infura-key-123';
    const solana = await Solana.getInstance('mainnet-beta');

    expect(solana.connection.rpcEndpoint).toBe('https://solana-mainnet.infura.io/v3/test-infura-key-123');
    expect(solana.getRpcProviderService()).toBeInstanceOf(InfuraSolanaService);
  });

  it('refuses to start without an Infura API key instead of using nodeURL', async () => {
    infuraKey = '';
    await expect(Solana.getInstance('mainnet-beta')).rejects.toThrow(
      "Solana rpcProvider is 'infura' but apiKeys.infura is not set",
    );
  });
});

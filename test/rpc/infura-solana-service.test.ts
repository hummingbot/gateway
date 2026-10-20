import { InfuraSolanaService } from '../../src/rpc/infura-solana-service';

describe('InfuraSolanaService', () => {
  const apiKey = 'test-infura-key-123';

  it('builds the mainnet-beta HTTP URL', () => {
    const service = new InfuraSolanaService({ apiKey }, { chain: 'solana', network: 'mainnet-beta', chainId: 101 });
    expect(service.getHttpUrl()).toBe('https://solana-mainnet.infura.io/v3/test-infura-key-123');
  });

  it('builds the devnet HTTP URL', () => {
    const service = new InfuraSolanaService({ apiKey }, { chain: 'solana', network: 'devnet', chainId: 103 });
    expect(service.getHttpUrl()).toBe('https://solana-devnet.infura.io/v3/test-infura-key-123');
  });

  it('has no WebSocket endpoint or transaction monitoring', () => {
    const service = new InfuraSolanaService({ apiKey }, { chain: 'solana', network: 'mainnet-beta', chainId: 101 });
    expect(service.getWebSocketUrl()).toBeNull();
    expect(service.supportsTransactionMonitoring()).toBe(false);
  });

  it.each(['', '   ', 'YOUR_INFURA_KEY'])('throws when the API key is %p', (badKey) => {
    expect(
      () => new InfuraSolanaService({ apiKey: badKey }, { chain: 'solana', network: 'mainnet-beta', chainId: 101 }),
    ).toThrow("Solana rpcProvider is 'infura' but apiKeys.infura is not set");
  });

  it('throws for a Solana network Infura does not serve', () => {
    expect(() => new InfuraSolanaService({ apiKey }, { chain: 'solana', network: 'testnet', chainId: 102 })).toThrow(
      "Infura does not support Solana network 'testnet'",
    );
  });

  it('rejects a non-Solana chain', () => {
    expect(() => new InfuraSolanaService({ apiKey }, { chain: 'ethereum', network: 'mainnet', chainId: 1 })).toThrow(
      'InfuraSolanaService only supports Solana networks',
    );
  });
});

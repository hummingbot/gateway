import { InfuraService } from '../../src/rpc/infura-service';

describe('InfuraService', () => {
  const testApiKey = 'test-infura-key-123';

  const serviceFor = (chainId: number, network: string) =>
    new InfuraService({ apiKey: testApiKey }, { chain: 'ethereum', network, chainId });

  describe('getHttpUrl', () => {
    it.each([
      [1, 'mainnet', 'mainnet'],
      [137, 'polygon', 'polygon-mainnet'],
      [42161, 'arbitrum', 'arbitrum-mainnet'],
      [10, 'optimism', 'optimism-mainnet'],
      [8453, 'base', 'base-mainnet'],
      [43114, 'avalanche', 'avalanche-mainnet'],
      [42220, 'celo', 'celo-mainnet'],
      [11155111, 'sepolia', 'sepolia'],
    ])('chainID %i (%s) uses the %s endpoint', (chainId, network, subdomain) => {
      expect(serviceFor(chainId, network).getHttpUrl()).toBe(`https://${subdomain}.infura.io/v3/${testApiKey}`);
    });

    it('should throw error for unsupported chainID', () => {
      expect(() => serviceFor(99999, 'unknown')).toThrow('Infura network not supported for chainID: 99999');
    });
  });

  describe('getWebSocketUrl', () => {
    it('should return null (WebSocket not used for Ethereum)', () => {
      expect(serviceFor(1, 'mainnet').getWebSocketUrl()).toBeNull();
    });
  });
});

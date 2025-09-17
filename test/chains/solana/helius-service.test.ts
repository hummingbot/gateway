import { HeliusService } from '../../../src/chains/solana/helius-service';
import { SolanaNetworkConfig } from '../../../src/chains/solana/solana.config';

describe('HeliusService', () => {
  let heliusService: HeliusService;
  let mockConfig: SolanaNetworkConfig;

  beforeEach(() => {
    mockConfig = {
      nodeURL: 'https://api.mainnet-beta.solana.com',
      nativeCurrencySymbol: 'SOL',
      defaultComputeUnits: 200000,
      confirmRetryInterval: 1,
      confirmRetryCount: 10,
      heliusAPIKey: 'test-api-key-123',
      useHeliusRestRPC: true,
      useHeliusWebSocketRPC: false,
      useHeliusSender: false,
      heliusRegionCode: 'slc',
      minPriorityFeePerCU: 0.01,
      jitoTipSOL: 0,
    };

    heliusService = new HeliusService(mockConfig);
  });

  describe('getUrlForNetwork', () => {
    it('should return mainnet Helius URL for mainnet-beta network', () => {
      const url = heliusService.getUrlForNetwork('mainnet-beta');

      expect(url).toBe('https://mainnet.helius-rpc.com/?api-key=test-api-key-123');
    });

    it('should return mainnet Helius URL for mainnet network', () => {
      const url = heliusService.getUrlForNetwork('mainnet');

      expect(url).toBe('https://mainnet.helius-rpc.com/?api-key=test-api-key-123');
    });

    it('should return devnet Helius URL for devnet network', () => {
      const url = heliusService.getUrlForNetwork('devnet');

      expect(url).toBe('https://devnet.helius-rpc.com/?api-key=test-api-key-123');
    });

    it('should return devnet Helius URL for networks containing "devnet"', () => {
      const url = heliusService.getUrlForNetwork('solana-devnet');

      expect(url).toBe('https://devnet.helius-rpc.com/?api-key=test-api-key-123');
    });

    it('should include the correct API key in the URL', () => {
      const customConfig = {
        ...mockConfig,
        heliusAPIKey: 'custom-api-key-456',
      };
      const customService = new HeliusService(customConfig);

      const url = customService.getUrlForNetwork('mainnet-beta');

      expect(url).toBe('https://mainnet.helius-rpc.com/?api-key=custom-api-key-456');
    });

    it('should handle empty API key', () => {
      const configWithEmptyKey = {
        ...mockConfig,
        heliusAPIKey: '',
      };
      const serviceWithEmptyKey = new HeliusService(configWithEmptyKey);

      const url = serviceWithEmptyKey.getUrlForNetwork('mainnet-beta');

      expect(url).toBe('https://mainnet.helius-rpc.com/?api-key=');
    });
  });
});

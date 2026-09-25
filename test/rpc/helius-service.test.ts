import { HeliusService } from '../../src/rpc/helius-service';

describe('HeliusService', () => {
  let heliusService: HeliusService;
  const testApiKey = 'test-helius-key-123';

  beforeEach(() => {
    heliusService = new HeliusService(
      { apiKey: testApiKey },
      { chain: 'solana', network: 'mainnet-beta', chainId: 101 },
    );
  });

  describe('getHttpUrl', () => {
    it('should return mainnet Helius URL for mainnet-beta network', () => {
      const url = heliusService.getHttpUrl();

      expect(url).toBe('https://mainnet.helius-rpc.com/?api-key=test-helius-key-123');
    });

    it('should return devnet Helius URL for devnet network', () => {
      const devnetService = new HeliusService(
        { apiKey: testApiKey },
        { chain: 'solana', network: 'devnet', chainId: 103 },
      );
      const url = devnetService.getHttpUrl();

      expect(url).toBe(`https://devnet.helius-rpc.com/?api-key=${testApiKey}`);
    });

    it('should return devnet Helius URL for networks containing "devnet"', () => {
      const devnetService = new HeliusService(
        { apiKey: testApiKey },
        { chain: 'solana', network: 'solana-devnet', chainId: 103 },
      );
      const url = devnetService.getHttpUrl();

      expect(url).toBe(`https://devnet.helius-rpc.com/?api-key=${testApiKey}`);
    });

    it('should handle empty API key', () => {
      const serviceWithEmptyKey = new HeliusService(
        { apiKey: '' },
        { chain: 'solana', network: 'mainnet-beta', chainId: 101 },
      );

      const url = serviceWithEmptyKey.getHttpUrl();

      expect(url).toBe('https://mainnet.helius-rpc.com/?api-key=');
    });
  });

  describe('getWebSocketUrl', () => {
    it('should return WebSocket URL when API key is valid', () => {
      const wsUrl = heliusService.getWebSocketUrl();

      expect(wsUrl).toBe(`wss://mainnet.helius-rpc.com/?api-key=${testApiKey}`);
    });

    it('should return null when API key is invalid', () => {
      const service = new HeliusService({ apiKey: '' }, { chain: 'solana', network: 'mainnet-beta', chainId: 101 });

      const wsUrl = service.getWebSocketUrl();

      expect(wsUrl).toBeNull();
    });

    it('should return devnet WebSocket URL for devnet network', () => {
      const devnetWsService = new HeliusService(
        { apiKey: testApiKey },
        { chain: 'solana', network: 'devnet', chainId: 103 },
      );

      const wsUrl = devnetWsService.getWebSocketUrl();

      expect(wsUrl).toBe(`wss://devnet.helius-rpc.com/?api-key=${testApiKey}`);
    });
  });

  describe('supportsTransactionMonitoring', () => {
    it('should return true when API key is valid', () => {
      expect(heliusService.supportsTransactionMonitoring()).toBe(true);
    });

    it('should return false when API key is invalid', () => {
      const service = new HeliusService({ apiKey: '' }, { chain: 'solana', network: 'mainnet-beta', chainId: 101 });

      expect(service.supportsTransactionMonitoring()).toBe(false);
    });
  });

  describe('isWebSocketConnected', () => {
    it('should return false when WebSocket is not initialized', () => {
      expect(heliusService.isWebSocketConnected()).toBe(false);
    });
  });
});

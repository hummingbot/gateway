import { InfuraService } from '../../../src/chains/ethereum/infura-service';

describe('InfuraService', () => {
  let infuraService: InfuraService;
  const testApiKey = 'test-infura-key-123';

  beforeEach(() => {
    infuraService = new InfuraService(
      {
        apiKey: testApiKey,
        useWebSocket: false,
      },
      {
        chain: 'ethereum',
        network: 'mainnet',
        chainId: 1,
      },
    );
  });

  describe('getHttpUrl', () => {
    it('should return mainnet Infura URL for Ethereum mainnet (chainID 1)', () => {
      const url = infuraService.getHttpUrl();

      expect(url).toBe('https://mainnet.infura.io/v3/test-infura-key-123');
    });

    it('should return polygon URL for Polygon mainnet (chainID 137)', () => {
      const polygonService = new InfuraService(
        { apiKey: 'test-infura-key-123', useWebSocket: false },
        { chain: 'ethereum', network: 'polygon', chainId: 137 },
      );

      const url = polygonService.getHttpUrl();

      expect(url).toBe('https://polygon-mainnet.infura.io/v3/test-infura-key-123');
    });

    it('should return arbitrum URL for Arbitrum mainnet (chainID 42161)', () => {
      const arbitrumService = new InfuraService(
        { apiKey: 'test-infura-key-123', useWebSocket: false },
        { chain: 'ethereum', network: 'arbitrum', chainId: 42161 },
      );

      const url = arbitrumService.getHttpUrl();

      expect(url).toBe('https://arbitrum-mainnet.infura.io/v3/test-infura-key-123');
    });

    it('should return optimism URL for Optimism mainnet (chainID 10)', () => {
      const optimismService = new InfuraService(
        { apiKey: 'test-infura-key-123', useWebSocket: false },
        { chain: 'ethereum', network: 'optimism', chainId: 10 },
      );

      const url = optimismService.getHttpUrl();

      expect(url).toBe('https://optimism-mainnet.infura.io/v3/test-infura-key-123');
    });

    it('should return base URL for Base mainnet (chainID 8453)', () => {
      const baseService = new InfuraService(
        { apiKey: 'test-infura-key-123', useWebSocket: false },
        { chain: 'ethereum', network: 'base', chainId: 8453 },
      );

      const url = baseService.getHttpUrl();

      expect(url).toBe('https://base-mainnet.infura.io/v3/test-infura-key-123');
    });

    it('should return avalanche URL for Avalanche mainnet (chainID 43114)', () => {
      const avalancheService = new InfuraService(
        { apiKey: 'test-infura-key-123', useWebSocket: false },
        { chain: 'ethereum', network: 'avalanche', chainId: 43114 },
      );

      const url = avalancheService.getHttpUrl();

      expect(url).toBe('https://avalanche-mainnet.infura.io/v3/test-infura-key-123');
    });

    it('should return celo URL for Celo mainnet (chainID 42220)', () => {
      const celoService = new InfuraService(
        { apiKey: 'test-infura-key-123', useWebSocket: false },
        { chain: 'ethereum', network: 'celo', chainId: 42220 },
      );

      const url = celoService.getHttpUrl();

      expect(url).toBe('https://celo-mainnet.infura.io/v3/test-infura-key-123');
    });

    it('should return sepolia URL for Sepolia testnet (chainID 11155111)', () => {
      const sepoliaService = new InfuraService(
        { apiKey: 'test-infura-key-123', useWebSocket: false },
        { chain: 'ethereum', network: 'sepolia', chainId: 11155111 },
      );

      const url = sepoliaService.getHttpUrl();

      expect(url).toBe('https://sepolia.infura.io/v3/test-infura-key-123');
    });

    it('should throw error for unsupported chainID', () => {
      expect(() => {
        new InfuraService(
          { apiKey: 'test-infura-key-123', useWebSocket: false },
          { chain: 'ethereum', network: 'unknown', chainId: 99999 },
        );
      }).toThrow('Infura network not supported for chainID: 99999');
    });
  });

  describe('getWebSocketUrl', () => {
    it('should return WebSocket URL when enabled', () => {
      const wsService = new InfuraService(
        { apiKey: 'test-infura-key-123', useWebSocket: true },
        { chain: 'ethereum', network: 'mainnet', chainId: 1 },
      );

      const wsUrl = wsService.getWebSocketUrl();

      expect(wsUrl).toBe('wss://mainnet.infura.io/ws/v3/test-infura-key-123');
    });

    it('should return null when WebSocket is disabled', () => {
      const service = new InfuraService(
        { apiKey: 'test-infura-key-123', useWebSocket: false },
        { chain: 'ethereum', network: 'mainnet', chainId: 1 },
      );

      const wsUrl = service.getWebSocketUrl();

      expect(wsUrl).toBeNull();
    });
  });
});

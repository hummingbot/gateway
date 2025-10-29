import { EthereumNetworkConfig } from '../../../src/chains/ethereum/ethereum.config';
import { InfuraService } from '../../../src/chains/ethereum/infura-service';

describe('InfuraService', () => {
  let infuraService: InfuraService;
  let mockConfig: EthereumNetworkConfig;

  beforeEach(() => {
    mockConfig = {
      chainID: 1,
      nodeURL: 'https://eth.llamarpc.com',
      nativeCurrencySymbol: 'ETH',
      infuraAPIKey: 'test-infura-key-123',
      useInfuraWebSocket: false,
    };

    infuraService = new InfuraService(mockConfig);
  });

  describe('getUrlForNetwork', () => {
    it('should return mainnet Infura URL for Ethereum mainnet (chainID 1)', () => {
      const url = infuraService.getUrlForNetwork('mainnet');

      expect(url).toBe('https://mainnet.infura.io/v3/test-infura-key-123');
    });

    it('should return polygon URL for Polygon mainnet (chainID 137)', () => {
      const polygonConfig = {
        ...mockConfig,
        chainID: 137,
      };
      const polygonService = new InfuraService(polygonConfig);

      const url = polygonService.getUrlForNetwork('polygon');

      expect(url).toBe('https://polygon-mainnet.infura.io/v3/test-infura-key-123');
    });

    it('should return arbitrum URL for Arbitrum mainnet (chainID 42161)', () => {
      const arbitrumConfig = {
        ...mockConfig,
        chainID: 42161,
      };
      const arbitrumService = new InfuraService(arbitrumConfig);

      const url = arbitrumService.getUrlForNetwork('arbitrum');

      expect(url).toBe('https://arbitrum-mainnet.infura.io/v3/test-infura-key-123');
    });

    it('should return optimism URL for Optimism mainnet (chainID 10)', () => {
      const optimismConfig = {
        ...mockConfig,
        chainID: 10,
      };
      const optimismService = new InfuraService(optimismConfig);

      const url = optimismService.getUrlForNetwork('optimism');

      expect(url).toBe('https://optimism-mainnet.infura.io/v3/test-infura-key-123');
    });

    it('should return base URL for Base mainnet (chainID 8453)', () => {
      const baseConfig = {
        ...mockConfig,
        chainID: 8453,
      };
      const baseService = new InfuraService(baseConfig);

      const url = baseService.getUrlForNetwork('base');

      expect(url).toBe('https://base-mainnet.infura.io/v3/test-infura-key-123');
    });

    it('should return avalanche URL for Avalanche mainnet (chainID 43114)', () => {
      const avalancheConfig = {
        ...mockConfig,
        chainID: 43114,
      };
      const avalancheService = new InfuraService(avalancheConfig);

      const url = avalancheService.getUrlForNetwork('avalanche');

      expect(url).toBe('https://avalanche-mainnet.infura.io/v3/test-infura-key-123');
    });

    it('should return sepolia URL for Sepolia testnet (chainID 11155111)', () => {
      const sepoliaConfig = {
        ...mockConfig,
        chainID: 11155111,
      };
      const sepoliaService = new InfuraService(sepoliaConfig);

      const url = sepoliaService.getUrlForNetwork('sepolia');

      expect(url).toBe('https://sepolia.infura.io/v3/test-infura-key-123');
    });

    it('should include the correct API key in the URL', () => {
      const customConfig = {
        ...mockConfig,
        infuraAPIKey: 'custom-infura-key-456',
      };
      const customService = new InfuraService(customConfig);

      const url = customService.getUrlForNetwork('mainnet');

      expect(url).toBe('https://mainnet.infura.io/v3/custom-infura-key-456');
    });

    it('should throw error for unsupported chain ID', () => {
      const unsupportedConfig = {
        ...mockConfig,
        chainID: 9999, // Unsupported chain ID
      };

      expect(() => {
        new InfuraService(unsupportedConfig);
      }).toThrow('Infura network not supported for chainID: 9999');
    });

    it('should handle empty API key', () => {
      const configWithEmptyKey = {
        ...mockConfig,
        infuraAPIKey: '',
      };
      const serviceWithEmptyKey = new InfuraService(configWithEmptyKey);

      const url = serviceWithEmptyKey.getUrlForNetwork('mainnet');

      expect(url).toBe('https://mainnet.infura.io/v3/');
    });
  });
});

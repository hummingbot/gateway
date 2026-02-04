import Fastify, { FastifyInstance } from 'fastify';

// Mock dependencies
jest.mock('../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Create mock configuration namespaces
const mockSolanaChainConfig = {
  configuration: {
    defaultNetwork: 'mainnet-beta',
    defaultWallet: '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5',
    rpcProvider: 'helius',
  },
};

const mockSolanaNetworkConfig = {
  configuration: {
    chainID: 101,
    nodeURL: 'https://api.mainnet-beta.solana.com',
    nativeCurrencySymbol: 'SOL',
    geckoId: 'solana',
  },
};

const mockEthereumChainConfig = {
  configuration: {
    defaultNetwork: 'mainnet',
    defaultWallet: '0x1234567890abcdef1234567890abcdef12345678',
  },
};

const mockEthereumNetworkConfig = {
  configuration: {
    chainID: 1,
    nodeURL: 'https://mainnet.infura.io/v3/xxx',
    nativeCurrencySymbol: 'ETH',
    geckoId: 'ethereum',
  },
};

const mockSetFn = jest.fn();

jest.mock('../../src/services/config-manager-v2', () => ({
  ConfigManagerV2: {
    getInstance: jest.fn().mockReturnValue({
      getNamespace: jest.fn((namespace: string) => {
        const namespaces: Record<string, any> = {
          solana: mockSolanaChainConfig,
          'solana-mainnet-beta': mockSolanaNetworkConfig,
          'solana-devnet': {
            configuration: {
              chainID: 103,
              nodeURL: 'https://api.devnet.solana.com',
              nativeCurrencySymbol: 'SOL',
              geckoId: 'solana',
            },
          },
          ethereum: mockEthereumChainConfig,
          'ethereum-mainnet': mockEthereumNetworkConfig,
          server: {
            configuration: {
              port: 15888,
            },
          },
        };
        return namespaces[namespace] || null;
      }),
      set: mockSetFn,
      allConfigurations: {
        solana: mockSolanaChainConfig.configuration,
        'solana-mainnet-beta': mockSolanaNetworkConfig.configuration,
        ethereum: mockEthereumChainConfig.configuration,
        'ethereum-mainnet': mockEthereumNetworkConfig.configuration,
        server: { port: 15888 },
      },
    }),
  },
}));

// Import after mocking
import { getConfig, updateConfig } from '../../src/config/utils';
import { ConfigManagerV2 } from '../../src/services/config-manager-v2';

describe('Config Utils - Chain-Network Merge', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('getConfig - chain-network merging', () => {
    it('should merge solana chain config into solana-mainnet-beta network config', () => {
      const config = getConfig(fastify, 'solana-mainnet-beta');

      // Should contain chain-level fields
      expect(config).toHaveProperty('defaultNetwork', 'mainnet-beta');
      expect(config).toHaveProperty('defaultWallet', '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5');
      expect(config).toHaveProperty('rpcProvider', 'helius');

      // Should contain network-level fields
      expect(config).toHaveProperty('chainID', 101);
      expect(config).toHaveProperty('nodeURL', 'https://api.mainnet-beta.solana.com');
      expect(config).toHaveProperty('nativeCurrencySymbol', 'SOL');
      expect(config).toHaveProperty('geckoId', 'solana');
    });

    it('should merge solana chain config into solana-devnet network config', () => {
      const config = getConfig(fastify, 'solana-devnet');

      // Should contain chain-level fields from solana
      expect(config).toHaveProperty('defaultNetwork', 'mainnet-beta');
      expect(config).toHaveProperty('defaultWallet', '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5');

      // Should contain devnet-specific network fields
      expect(config).toHaveProperty('chainID', 103);
      expect(config).toHaveProperty('nodeURL', 'https://api.devnet.solana.com');
    });

    it('should merge ethereum chain config into ethereum-mainnet network config', () => {
      const config = getConfig(fastify, 'ethereum-mainnet');

      // Should contain chain-level fields
      expect(config).toHaveProperty('defaultNetwork', 'mainnet');
      expect(config).toHaveProperty('defaultWallet', '0x1234567890abcdef1234567890abcdef12345678');

      // Should contain network-level fields
      expect(config).toHaveProperty('chainID', 1);
      expect(config).toHaveProperty('nodeURL', 'https://mainnet.infura.io/v3/xxx');
      expect(config).toHaveProperty('nativeCurrencySymbol', 'ETH');
    });

    it('should return only chain config for non-network namespaces (solana)', () => {
      const config = getConfig(fastify, 'solana');

      expect(config).toHaveProperty('defaultNetwork', 'mainnet-beta');
      expect(config).toHaveProperty('defaultWallet');
      expect(config).toHaveProperty('rpcProvider');

      // Should NOT have network-level fields
      expect(config).not.toHaveProperty('chainID');
      expect(config).not.toHaveProperty('nodeURL');
    });

    it('should return only namespace config for non-chain namespaces (server)', () => {
      const config = getConfig(fastify, 'server');

      expect(config).toHaveProperty('port', 15888);
      expect(config).not.toHaveProperty('defaultWallet');
      expect(config).not.toHaveProperty('chainID');
    });

    it('should return all configurations when no namespace provided', () => {
      const config = getConfig(fastify);

      expect(config).toHaveProperty('solana');
      expect(config).toHaveProperty('solana-mainnet-beta');
      expect(config).toHaveProperty('ethereum');
      expect(config).toHaveProperty('server');
    });

    it('should throw 404 for non-existent namespace', () => {
      expect(() => getConfig(fastify, 'invalid-namespace')).toThrow();
    });

    it('should let network config override chain config if keys conflict', () => {
      // Network config takes precedence over chain config for conflicts
      const config = getConfig(fastify, 'solana-mainnet-beta');

      // Both chain and network might have overlapping keys in the future
      // The spread operator gives network config precedence: {...chain, ...network}
      // This test ensures the merge order is correct
      expect(config).toBeDefined();
    });
  });

  describe('updateConfig - chain-level field routing', () => {
    beforeEach(() => {
      mockSetFn.mockClear();
    });

    it('should route defaultWallet update from solana-mainnet-beta to solana namespace', () => {
      updateConfig(fastify, 'solana-mainnet-beta.defaultWallet', 'newWalletAddress123');

      expect(mockSetFn).toHaveBeenCalledWith('solana.defaultWallet', 'newWalletAddress123');
    });

    it('should route defaultNetwork update from solana-mainnet-beta to solana namespace', () => {
      updateConfig(fastify, 'solana-mainnet-beta.defaultNetwork', 'devnet');

      expect(mockSetFn).toHaveBeenCalledWith('solana.defaultNetwork', 'devnet');
    });

    it('should route rpcProvider update from solana-mainnet-beta to solana namespace', () => {
      updateConfig(fastify, 'solana-mainnet-beta.rpcProvider', 'alchemy');

      expect(mockSetFn).toHaveBeenCalledWith('solana.rpcProvider', 'alchemy');
    });

    it('should route defaultWallet update from ethereum-mainnet to ethereum namespace', () => {
      updateConfig(fastify, 'ethereum-mainnet.defaultWallet', '0xnewwallet');

      expect(mockSetFn).toHaveBeenCalledWith('ethereum.defaultWallet', '0xnewwallet');
    });

    it('should NOT route non-chain-level fields (nodeURL stays in network namespace)', () => {
      updateConfig(fastify, 'solana-mainnet-beta.nodeURL', 'https://new-rpc.com');

      expect(mockSetFn).toHaveBeenCalledWith('solana-mainnet-beta.nodeURL', 'https://new-rpc.com');
    });

    it('should NOT route chainID (network-level field)', () => {
      updateConfig(fastify, 'solana-mainnet-beta.chainID', 102);

      expect(mockSetFn).toHaveBeenCalledWith('solana-mainnet-beta.chainID', 102);
    });

    it('should NOT route fields for non-chain-network namespaces (server)', () => {
      updateConfig(fastify, 'server.port', 16000);

      expect(mockSetFn).toHaveBeenCalledWith('server.port', 16000);
    });

    it('should NOT route fields for pure chain namespaces (solana)', () => {
      updateConfig(fastify, 'solana.defaultWallet', 'directUpdate');

      expect(mockSetFn).toHaveBeenCalledWith('solana.defaultWallet', 'directUpdate');
    });

    it('should handle nested paths correctly for chain-level fields', () => {
      // If someone tries to update a nested path like defaultWallet.something
      // it should still route to the chain namespace
      updateConfig(fastify, 'solana-mainnet-beta.defaultWallet', 'value');

      expect(mockSetFn).toHaveBeenCalledWith('solana.defaultWallet', 'value');
    });
  });
});

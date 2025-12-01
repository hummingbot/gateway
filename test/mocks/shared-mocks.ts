/**
 * Shared mock implementations for common dependencies
 * Import this file at the top of test files that need these mocks
 */

// Logger mock
export const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

// redactUrl mock - returns URL as-is in tests
export const mockRedactUrl = jest.fn((url: string) => url);

// ConfigManagerV2 mock with dynamic config storage
export const mockConfigStorage: Record<string, any> = {
  'server.port': 15888,
  'server.docsPort': 19999,
  'server.fastifyLogs': false,
  'server.logToStdOut': false,
  'logging.logPath': './logs',
  'server.GMTOffset': 0,
  // Solana configurations
  'solana-mainnet-beta.nodeURL': 'https://api.mainnet-beta.solana.com',
  'solana-mainnet-beta.nativeCurrencySymbol': 'SOL',
  'solana-devnet.nodeURL': 'https://api.devnet.solana.com',
  'solana-devnet.nativeCurrencySymbol': 'SOL',
  // Ethereum configurations
  'ethereum-mainnet.nodeURL': 'https://mainnet.infura.io/v3/test',
  'ethereum-mainnet.nativeCurrencySymbol': 'ETH',
  'ethereum-goerli.nodeURL': 'https://goerli.infura.io/v3/test',
  'ethereum-goerli.nativeCurrencySymbol': 'ETH',
  // Connector configurations
  'jupiter.slippagePct': 1,
  'jupiter.priorityLevel': 'medium',
  'jupiter.apiKey': undefined,
  'meteora.slippagePct': 1,
  'raydium.slippagePct': 1,
  'orca.slippagePct': 1,
  'uniswap.slippagePct': '0.01',
  'uniswap.ttl': 300,
};

export const mockConfigManagerV2 = {
  getInstance: jest.fn().mockReturnValue({
    get: jest.fn().mockImplementation((key: string) => mockConfigStorage[key]),
    set: jest.fn().mockImplementation((key: string, value: any) => {
      mockConfigStorage[key] = value;
    }),
    getNamespace: jest.fn(),
    namespaces: {
      server: {},
      'ethereum-mainnet': {},
      'ethereum-goerli': {},
      'solana-mainnet-beta': {},
      'solana-devnet': {},
      uniswap: {},
      jupiter: {},
      meteora: {},
      raydium: {},
      orca: {},
    },
    allConfigurations: mockConfigStorage,
  }),
};

// Fastify httpErrors mock factory
export const createMockFastify = () => ({
  httpErrors: {
    badRequest: jest.fn((msg: string) => {
      const error = new Error(`Bad Request: ${msg}`);
      (error as any).statusCode = 400;
      throw error;
    }),
    notFound: jest.fn((msg: string) => {
      const error = new Error(`Not Found: ${msg}`);
      (error as any).statusCode = 404;
      throw error;
    }),
    internalServerError: jest.fn((msg: string) => {
      const error = new Error(`Internal Server Error: ${msg}`);
      (error as any).statusCode = 500;
      throw error;
    }),
  },
});

// PoolService mock
export const mockPoolService = {
  getDefaultPools: jest.fn(),
};

export const mockPoolServiceInstance = {
  PoolService: {
    getInstance: jest.fn().mockReturnValue(mockPoolService),
  },
};

// Token list mock data
export const mockTokenList = {
  tokens: [
    {
      symbol: 'SOL',
      address: 'So11111111111111111111111111111111111111112',
      decimals: 9,
    },
    {
      symbol: 'USDC',
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
    },
    {
      symbol: 'ETH',
      address: '0x0000000000000000000000000000000000000000',
      decimals: 18,
    },
  ],
};

// Cert passphrase mock
export const mockConfigManagerCertPassphrase = {
  readPassphrase: jest.fn().mockReturnValue('test-passphrase'),
};

// HTTPS options mock
export const mockHttpsOptions = {
  getHttpsOptions: jest.fn().mockReturnValue(null),
};

// Chain config mocks
export const mockSolanaChainConfig = {
  defaultNetwork: 'mainnet-beta',
  defaultWallet: 'test-wallet',
  rpcProvider: 'url',
};

export const mockEthereumChainConfig = {
  defaultNetwork: 'mainnet',
  defaultWallet: 'test-wallet',
  rpcProvider: 'url',
};

// Setup all common mocks
export function setupCommonMocks(options: { skipLogger?: boolean } = {}) {
  // Mock logger only if not skipped
  if (!options.skipLogger) {
    jest.mock('../../src/services/logger', () => ({
      logger: mockLogger,
      redactUrl: mockRedactUrl,
      updateLoggerToStdout: jest.fn(),
    }));
  }

  // Mock ConfigManagerV2
  jest.mock('../../src/services/config-manager-v2', () => ({
    ConfigManagerV2: mockConfigManagerV2,
  }));

  // Mock ConfigManagerCertPassphrase
  jest.mock('../../src/services/config-manager-cert-passphrase', () => ({
    ConfigManagerCertPassphrase: mockConfigManagerCertPassphrase,
  }));

  // Mock HTTPS
  jest.mock('../../src/https', () => mockHttpsOptions);

  // Mock chain configs
  jest.mock('../../src/chains/solana/solana.config', () => ({
    ...jest.requireActual('../../src/chains/solana/solana.config'),
    getSolanaChainConfig: jest.fn().mockReturnValue(mockSolanaChainConfig),
  }));

  jest.mock('../../src/chains/ethereum/ethereum.config', () => ({
    ...jest.requireActual('../../src/chains/ethereum/ethereum.config'),
    getEthereumChainConfig: jest.fn().mockReturnValue(mockEthereumChainConfig),
  }));

  // Mock fs for token lists
  jest.mock('fs', () => {
    const actualFs = jest.requireActual('fs');
    return {
      ...actualFs,
      existsSync: jest.fn().mockImplementation((path: string) => {
        if (path.includes('tokens') || path.includes('lists')) {
          return true;
        }
        return actualFs.existsSync(path);
      }),
      readFileSync: jest.fn().mockImplementation((path: string) => {
        if (path.includes('tokens') || path.includes('lists')) {
          return JSON.stringify(mockTokenList);
        }
        return actualFs.readFileSync(path);
      }),
    };
  });
}

// Reset all mocks
export function resetAllMocks() {
  jest.clearAllMocks();

  // Reset config storage to defaults
  Object.keys(mockConfigStorage).forEach((key) => {
    delete mockConfigStorage[key];
  });

  // Restore defaults
  Object.assign(mockConfigStorage, {
    'server.port': 15888,
    'server.docsPort': 19999,
    'server.fastifyLogs': false,
    'server.logToStdOut': false,
    'logging.logPath': './logs',
    'server.GMTOffset': 0,
    'solana-mainnet-beta.nodeURL': 'https://api.mainnet-beta.solana.com',
    'solana-mainnet-beta.nativeCurrencySymbol': 'SOL',
    'solana-devnet.nodeURL': 'https://api.devnet.solana.com',
    'solana-devnet.nativeCurrencySymbol': 'SOL',
    'ethereum-mainnet.nodeURL': 'https://mainnet.infura.io/v3/test',
    'ethereum-mainnet.nativeCurrencySymbol': 'ETH',
    'ethereum-goerli.nodeURL': 'https://goerli.infura.io/v3/test',
    'ethereum-goerli.nativeCurrencySymbol': 'ETH',
    'jupiter.slippagePct': 1,
    'jupiter.priorityLevel': 'medium',
    'jupiter.apiKey': undefined,
    'meteora.slippagePct': 1,
    'raydium.slippagePct': 1,
    'orca.slippagePct': 1,
    'uniswap.slippagePct': '0.01',
    'uniswap.ttl': 300,
  });
}

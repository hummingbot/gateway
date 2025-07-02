// Shared mocks for tests that use gatewayApp

// Mock logger
jest.mock('../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock ConfigManagerV2
jest.mock('../../src/services/config-manager-v2', () => ({
  ConfigManagerV2: {
    getInstance: jest.fn().mockReturnValue({
      get: jest.fn().mockImplementation((key: string) => {
        const mockConfig: Record<string, any> = {
          'server.port': 15888,
          'server.docsPort': 19999,
          'server.fastifyLogs': false,
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
          // Jupiter configurations
          'jupiter.allowedSlippage': '0.01',
          'jupiter.priorityLevel': 'medium',
          'jupiter.apiKey': undefined,
          // Meteora configurations
          'meteora.allowedSlippage': '0.01',
          // Raydium configurations
          'raydium.allowedSlippage': '0.01',
          // Uniswap configurations
          'uniswap.allowedSlippage': '0.01',
          'uniswap.ttl': 300,
        };
        return mockConfig[key];
      }),
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
      },
    }),
  },
}));

// Mock HTTPS options
jest.mock('../../src/https', () => ({
  getHttpsOptions: jest.fn().mockReturnValue(null),
}));

// Mock token lists
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockImplementation((path: string) => {
    if (path.includes('tokens')) {
      return JSON.stringify({
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
      });
    }
    return jest.requireActual('fs').readFileSync(path);
  }),
}));

// Export empty object to make this a module
export {};

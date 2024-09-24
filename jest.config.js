module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  forceExit: true,
  coveragePathIgnorePatterns: [
    'src/app.ts',
    'src/https.ts',
    'src/paths.ts',
    'src/services/ethereum-base.ts',
    'src/services/cosmos-base.ts',
    'src/services/telemetry-transport.ts',
    'src/chains/cronos/cronos.ts',
    'src/chains/binance-smart-chain/binance-smart-chain.ts',
    'src/chains/ethereum/ethereum.ts',
    'src/chains/avalanche/avalanche.ts',
    'src/chains/celo/celo.ts',
    'src/chains/avalanche/pangolin/pangolin.ts',
    'src/chains/cosmos/cosmos.ts',
    'src/connectors/uniswap/uniswap.config.ts',
    'src/connectors/uniswap/uniswap.ts',
    'src/connectors/uniswap/uniswap.lp.helper.ts',
    'src/connectors/openocean/openocean.ts',
    'src/connectors/pangolin/pangolin.ts',
    'src/connectors/quickswap/quickswap.ts',
    'src/connectors/sushiswap/sushiswap.ts',
    'src/connectors/traderjoe/traderjoe.ts',
    'src/network/network.controllers.ts',
    'src/services/ethereum-base.ts',
    'src/services/telemetry-transport.ts',
    'test/*',
  ],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.js'],
  globalSetup: '<rootDir>/test/setup.ts',
  globalTeardown: '<rootDir>/test/teardown.ts',
  moduleNameMapper: {
    eccrypto: '<rootDir>/test/mock/eccrypto-mock.js',
    // Add carbon sdk subpath imports that are unsupported until jest v29.4.0
    '@bancor/carbon-sdk/strategy-management':
      '<rootDir>/node_modules/@bancor/carbon-sdk/dist/strategy-management/index.cjs',
    '@bancor/carbon-sdk/utils':
      '<rootDir>/node_modules/@bancor/carbon-sdk/dist/utils/index.cjs',
    '@bancor/carbon-sdk/contracts-api':
      '<rootDir>/node_modules/@bancor/carbon-sdk/dist/contracts-api/index.cjs',
    '@bancor/carbon-sdk/chain-cache':
      '<rootDir>/node_modules/@bancor/carbon-sdk/dist/chain-cache/index.cjs',
  },
  testPathIgnorePatterns: ['/node_modules/', 'test-helpers'],
};

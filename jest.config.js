module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  forceExit: true,
  coveragePathIgnorePatterns: [
    'src/app.ts',
    'src/https.ts',
    'src/paths.ts',
    'src/services/ethereum-base.ts',
    'src/services/telemetry-transport.ts',
    'src/connectors/uniswap/uniswap.config.ts',
    'src/connectors/uniswap/uniswap.ts',
    'src/connectors/uniswap/uniswap.lp.helper.ts',
    'src/network/network.controllers.ts',
    'src/services/ethereum-base.ts',
    'src/services/telemetry-transport.ts',
    'test/*',
  ],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.js'],
  moduleNameMapper: {
  },
  testPathIgnorePatterns: ['/node_modules/', 'test-helpers'],
};

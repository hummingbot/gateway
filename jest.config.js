const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');
process.env.GATEWAY_TEST_MODE = 'test';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  forceExit: true,
  detectOpenHandles: false,

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
    'test/*',
  ],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  setupFilesAfterEnv: [
    '<rootDir>/test/jest-setup.js',
    '<rootDir>/test/superjson-setup.ts',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    'test-helpers',
  ],
  testMatch: ['<rootDir>/test/**/*.test.ts', 
    '<rootDir>/test/**/*.test.js',
    // NOTE: DOES include play tests, does NOT include record tests 
    '<rootDir>/test-play/**/*.test.ts',
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  transformIgnorePatterns: ['/node_modules/(?!.*superjson)'],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    prefix: '<rootDir>/',
  }),
};

const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

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
    'test/*',
  ],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  setupFilesAfterEnv: ['<rootDir>/test/jest-setup.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    'test-helpers',
    '<rootDir>/test-scripts/',
  ],
  testMatch: ['<rootDir>/test/**/*.test.ts', '<rootDir>/test/**/*.test.js'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  transformIgnorePatterns: ['/node_modules/(?!.*superjson)'],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    prefix: '<rootDir>/',
  }),
};

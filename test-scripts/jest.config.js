const sharedConfig = require('../jest.config.js');
// Placed in this directory to allow jest runner to discover this config file

module.exports = {
  ...sharedConfig,
  rootDir: '..',
  displayName: 'test-scripts',
  testMatch: ['<rootDir>/test-scripts/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/test/'],
  snapshotResolver: '<rootDir>/test-scripts/snapshot-resolver.js',
};
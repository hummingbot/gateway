const sharedConfig = require('../jest.config.js');
// Placed in this directory to allow jest runner to discover this config file

module.exports = {
  ...sharedConfig,
  rootDir: '..',
  displayName: 'test-record',
  testMatch: ['<rootDir>/test-record/**/*.test.ts'],
  snapshotResolver: '<rootDir>/test-record/snapshot-resolver.js',
};
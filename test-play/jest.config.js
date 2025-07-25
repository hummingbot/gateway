const sharedConfig = require('../jest.config.js');
// Placed in this directory to allow jest runner to discover this config file

if (process.argv.includes('--updateSnapshot') || process.argv.includes('-u')) {
  throw new Error("The '--updateSnapshot' flag is not allowed during \"Play\" mode tests. Use 'test-record' to update snapshots.");
}

module.exports = {
  ...sharedConfig,
  rootDir: '..',
  displayName: 'test-play',
  testMatch: ['<rootDir>/test-play/**/*.test.ts'],
};
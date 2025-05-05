#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

// Set the environment variable to run in live mode
process.env.GATEWAY_TEST_MODE = 'live';

console.log('Running Raydium live tests...');
console.log('Note: These tests may make real network calls to mainnet-beta');
console.log('--------------------------------------------------------------');

try {
  // Run the Raydium live tests
  execSync('npx jest --forceExit ./test/schemas/trading-types/live-tests/raydium-simple.test.js', { 
    stdio: 'inherit',
    env: { ...process.env, GATEWAY_TEST_MODE: 'live' }
  });
  
  console.log('✅ Live tests completed successfully!');
} catch (error) {
  console.error('❌ Live tests failed:', error.message);
  process.exit(1);
}
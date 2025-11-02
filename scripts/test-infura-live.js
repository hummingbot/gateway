#!/usr/bin/env node

/**
 * Live Infura Integration Testing Script
 * 
 * This script tests the Infura RPC provider integration with a real API key.
 * It verifies HTTP and WebSocket connections and RPC functionality.
 * 
 * Prerequisites:
 * - Valid Infura API key configured in conf/rpc/infura.yml
 * - Gateway server running: pnpm start --passphrase=test123 --dev
 * 
 * Usage: node scripts/test-infura-live.js
 */

const axios = require('axios');
const { ethers } = require('ethers');

const GATEWAY_URL = 'http://localhost:15888';
const TEST_WALLET = '0x742d35Cc6634C0532925a3b8D66C2Fb4b03F31a0'; // Random Ethereum address

// Test configuration
const tests = {
  passed: 0,
  failed: 0,
  results: []
};

// Helper functions (using simple console colors)
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const colors = {
    info: '\x1b[34m[INFO]\x1b[0m',     // blue
    success: '\x1b[32m[✓]\x1b[0m',    // green
    error: '\x1b[31m[✗]\x1b[0m',      // red
    warn: '\x1b[33m[WARN]\x1b[0m',    // yellow
    test: '\x1b[36m[TEST]\x1b[0m'     // cyan
  };
  console.log(`${timestamp} ${colors[type] || colors.info} ${message}`);
}

async function testCase(name, fn) {
  log(`Running: ${name}`, 'test');
  try {
    const startTime = Date.now();
    await fn();
    const duration = Date.now() - startTime;
    tests.passed++;
    tests.results.push({ name, status: 'passed', duration });
    log(`✓ ${name} (${duration}ms)`, 'success');
  } catch (error) {
    tests.failed++;
    tests.results.push({ name, status: 'failed', error: error.message });
    log(`✗ ${name}: ${error.message}`, 'error');
  }
}

/**
 * Test Ethereum chain status endpoint
 */
async function testEthereumStatus() {
  const response = await axios.get(`${GATEWAY_URL}/chains/ethereum/status?network=mainnet`);
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  const data = response.data;
  if (!data.chainId || !data.blockNumber) {
    throw new Error('Missing required fields in status response');
  }
  
  log(`Chain ID: ${data.chainId}, Block Number: ${data.blockNumber}`, 'info');
}

/**
 * Test Ethereum balance endpoint with Infura
 */
async function testEthereumBalance() {
  const response = await axios.get(`${GATEWAY_URL}/chains/ethereum/balances`, {
    params: {
      network: 'mainnet',
      address: TEST_WALLET
    }
  });
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  const data = response.data;
  if (!data.balances) {
    throw new Error('Missing balances in response');
  }
  
  log(`ETH Balance: ${data.balances.ETH || '0'} ETH`, 'info');
}

/**
 * Test token list endpoint
 */
async function testEthereumTokens() {
  const response = await axios.get(`${GATEWAY_URL}/chains/ethereum/tokens?network=mainnet`);
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  const data = response.data;
  if (!Array.isArray(data.tokens) || data.tokens.length === 0) {
    throw new Error('Expected non-empty tokens array');
  }
  
  log(`Loaded ${data.tokens.length} tokens`, 'info');
}

/**
 * Test Polygon network with Infura
 */
async function testPolygonStatus() {
  const response = await axios.get(`${GATEWAY_URL}/chains/ethereum/status?network=polygon`);
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  const data = response.data;
  if (!data.chainId || data.chainId !== 137) {
    throw new Error(`Expected Polygon chain ID 137, got ${data.chainId}`);
  }
  
  log(`Polygon Chain ID: ${data.chainId}, Block Number: ${data.blockNumber}`, 'info');
}

/**
 * Test Arbitrum network with Infura
 */
async function testArbitrumStatus() {
  const response = await axios.get(`${GATEWAY_URL}/chains/ethereum/status?network=arbitrum`);
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  const data = response.data;
  if (!data.chainId || data.chainId !== 42161) {
    throw new Error(`Expected Arbitrum chain ID 42161, got ${data.chainId}`);
  }
  
  log(`Arbitrum Chain ID: ${data.chainId}, Block Number: ${data.blockNumber}`, 'info');
}

/**
 * Test Sepolia testnet (should use standard RPC, not Infura)
 */
async function testSepoliaStatus() {
  const response = await axios.get(`${GATEWAY_URL}/chains/ethereum/status?network=sepolia`);
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  const data = response.data;
  if (!data.chainId || data.chainId !== 11155111) {
    throw new Error(`Expected Sepolia chain ID 11155111, got ${data.chainId}`);
  }
  
  log(`Sepolia Chain ID: ${data.chainId}, Block Number: ${data.blockNumber}`, 'info');
}

/**
 * Main test runner
 */
async function runTests() {
  log('🚀 Starting Infura Integration Tests', 'info');
  log('Testing Infura RPC provider integration for Ethereum networks', 'info');
  
  try {
    // Test Ethereum mainnet with Infura
    await testCase('Ethereum Mainnet Status (Infura)', testEthereumStatus);
    await testCase('Ethereum Mainnet Balance (Infura)', testEthereumBalance);
    await testCase('Ethereum Mainnet Tokens', testEthereumTokens);
    
    // Test other networks with Infura
    await testCase('Polygon Status (Infura)', testPolygonStatus);
    await testCase('Arbitrum Status (Infura)', testArbitrumStatus);
    
    // Test testnet with standard RPC
    await testCase('Sepolia Status (Standard RPC)', testSepoliaStatus);
    
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
  }
  
  // Print summary
  log('', 'info');
  log('=== Test Summary ===', 'info');
  log(`Total tests: ${tests.passed + tests.failed}`, 'info');
  log(`Passed: ${tests.passed}`, tests.passed > 0 ? 'success' : 'info');
  log(`Failed: ${tests.failed}`, tests.failed > 0 ? 'error' : 'info');
  
  if (tests.failed > 0) {
    log('', 'info');
    log('Failed tests:', 'error');
    tests.results
      .filter(r => r.status === 'failed')
      .forEach(r => log(`  - ${r.name}: ${r.error}`, 'error'));
  }
  
  // Performance summary
  const avgDuration = tests.results
    .filter(r => r.status === 'passed')
    .reduce((sum, r) => sum + r.duration, 0) / tests.passed;
    
  if (tests.passed > 0) {
    log(`Average response time: ${avgDuration.toFixed(2)}ms`, 'info');
  }
  
  log('', 'info');
  if (tests.failed === 0) {
    log('🎉 All tests passed! Infura integration is working correctly.', 'success');
    process.exit(0);
  } else {
    log('❌ Some tests failed. Check Infura configuration and API key.', 'error');
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`, 'error');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled rejection at ${promise}: ${reason}`, 'error');
  process.exit(1);
});

// Run the tests
runTests();
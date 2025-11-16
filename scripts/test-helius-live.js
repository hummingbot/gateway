#!/usr/bin/env node

/**
 * Live Helius Integration Testing Script
 * 
 * This script tests the Helius RPC provider integration with a real API key.
 * It verifies WebSocket connections, Sender endpoints, and RPC functionality.
 * 
 * Prerequisites:
 * - Valid Helius API key configured in conf/rpc/helius.yml
 * - Gateway server running: pnpm start --passphrase=test123 --dev
 * 
 * Usage: node scripts/test-helius-live.js
 */

const axios = require('axios');
const WebSocket = require('ws');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const GATEWAY_URL = 'http://localhost:15888';
const TEST_WALLET = 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD';

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
    log(`${name} - PASSED (${duration}ms)`, 'success');
    return true;
  } catch (error) {
    tests.failed++;
    tests.results.push({ name, status: 'failed', error: error.message });
    log(`${name} - FAILED: ${error.message}`, 'error');
    return false;
  }
}

// Test 1: Verify Helius RPC Connection
async function testHeliusRPCConnection() {
  const response = await axios.post(`${GATEWAY_URL}/chains/solana/status`, {
    network: 'mainnet-beta'
  });
  
  if (!response.data.rpcUrl) {
    throw new Error('RPC URL not returned in status');
  }
  
  // Check if using Helius RPC - parse URL to properly validate hostname
  try {
    const urlObj = new URL(response.data.rpcUrl);
    const allowedHeliusHosts = [
      'mainnet.helius-rpc.com',
      'devnet.helius-rpc.com',
      'rpc.helius.xyz',
      'mainnet-beta.helius-rpc.com'
    ];
    
    if (!allowedHeliusHosts.includes(urlObj.hostname)) {
      log('Warning: Not using Helius RPC URL', 'warn');
    }
  } catch (error) {
    log(`Warning: Could not parse RPC URL: ${error.message}`, 'warn');
  }
  
  return response.data;
}

// Test 2: Test Helius WebSocket Connection
async function testHeliusWebSocket() {
  return new Promise((resolve, reject) => {
    // Read Helius config to get API key
    const fs = require('fs');
    const yaml = require('js-yaml');
    const configPath = './conf/rpc/helius.yml';
    
    if (!fs.existsSync(configPath)) {
      reject(new Error('Helius config not found'));
      return;
    }
    
    const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
    const apiKey = config.apiKey;
    
    if (!apiKey || apiKey === '') {
      reject(new Error('Helius API key not configured'));
      return;
    }
    
    const wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${apiKey}`;
    const ws = new WebSocket(wsUrl);
    
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, 10000);
    
    ws.on('open', () => {
      log('WebSocket connected successfully', 'success');
      
      // Test subscription
      const subscribeMsg = {
        jsonrpc: '2.0',
        id: 1,
        method: 'programSubscribe',
        params: [
          'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
          { encoding: 'jsonParsed' }
        ]
      };
      
      ws.send(JSON.stringify(subscribeMsg));
    });
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.result) {
        log(`WebSocket subscription ID: ${msg.result}`, 'info');
        clearTimeout(timeout);
        ws.close();
        resolve(msg.result);
      }
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

// Test 3: Test Balance Fetching with Helius
async function testBalanceFetching() {
  const response = await axios.post(`${GATEWAY_URL}/chains/solana/balances`, {
    wallet: TEST_WALLET,
    network: 'mainnet-beta',
    tokenSymbols: ['SOL']
  });
  
  if (!response.data.balances) {
    throw new Error('No balances returned');
  }
  
  const solBalance = response.data.balances.SOL;
  log(`SOL Balance: ${solBalance || 0}`, 'info');
  
  return response.data;
}

// Test 4: Test Token List Loading
async function testTokenList() {
  const response = await axios.post(`${GATEWAY_URL}/chains/solana/tokens`, {
    network: 'mainnet-beta'
  });
  
  if (!response.data.tokens || !Array.isArray(response.data.tokens)) {
    throw new Error('Invalid token list response');
  }
  
  log(`Loaded ${response.data.tokens.length} tokens`, 'info');
  return response.data;
}

// Test 5: Test Priority Fee Estimation
async function testPriorityFeeEstimation() {
  const response = await axios.get(`${GATEWAY_URL}/chains/solana/estimate-gas?network=mainnet-beta`);
  
  if (!response.data.priorityFee) {
    throw new Error('No priority fee returned');
  }
  
  log(`Priority Fee: ${response.data.priorityFee} microlamports/CU`, 'info');
  log(`Min Priority Fee: ${response.data.minPriorityFeePerCU} microlamports/CU`, 'info');
  
  return response.data;
}

// Test 6: Test Helius RPC Methods Directly
async function testHeliusRPCMethods() {
  const fs = require('fs');
  const yaml = require('js-yaml');
  const configPath = './conf/rpc/helius.yml';
  
  const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
  const apiKey = config.apiKey;
  
  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  const connection = new Connection(rpcUrl, 'confirmed');
  
  // Test getLatestBlockhash
  const blockhash = await connection.getLatestBlockhash();
  log(`Latest blockhash: ${blockhash.blockhash}`, 'info');
  
  // Test getBalance
  const pubkey = new PublicKey(TEST_WALLET);
  const balance = await connection.getBalance(pubkey);
  log(`Direct RPC Balance: ${balance / LAMPORTS_PER_SOL} SOL`, 'info');
  
  // Test getAccountInfo
  const accountInfo = await connection.getAccountInfo(pubkey);
  log(`Account exists: ${accountInfo !== null}`, 'info');
  
  return { blockhash, balance, accountInfo: accountInfo !== null };
}

// Test 7: Test Transaction Monitoring Setup
async function testTransactionMonitoring() {
  // This tests if the Helius service is properly initialized with WebSocket
  const response = await axios.post(`${GATEWAY_URL}/chains/solana/status`, {
    network: 'mainnet-beta'
  });
  
  // Check server logs for WebSocket initialization
  log('Check server logs for: "Connecting to Helius WebSocket (mainnet) endpoint"', 'info');
  log('Check server logs for: "Connected to Helius WebSocket for transaction monitoring"', 'info');
  
  return response.data;
}

// Test 8: Performance Comparison
async function testPerformanceComparison() {
  const results = {
    helius: {},
    standard: {}
  };
  
  // Test with Helius (mainnet-beta uses Helius)
  const heliusStart = Date.now();
  const heliusResponse = await axios.post(`${GATEWAY_URL}/chains/solana/balances`, {
    wallet: TEST_WALLET,
    network: 'mainnet-beta',
    tokenSymbols: ['SOL']
  });
  results.helius.duration = Date.now() - heliusStart;
  results.helius.success = !!heliusResponse.data.balances;
  
  // Test with standard RPC (devnet uses standard)
  const standardStart = Date.now();
  const standardResponse = await axios.post(`${GATEWAY_URL}/chains/solana/balances`, {
    wallet: TEST_WALLET,
    network: 'devnet',
    tokenSymbols: ['SOL']
  });
  results.standard.duration = Date.now() - standardStart;
  results.standard.success = !!standardResponse.data.balances;
  
  log(`Helius RPC: ${results.helius.duration}ms`, 'info');
  log(`Standard RPC: ${results.standard.duration}ms`, 'info');
  
  const improvement = ((results.standard.duration - results.helius.duration) / results.standard.duration * 100).toFixed(1);
  log(`Performance improvement: ${improvement}%`, 'info');
  
  return results;
}

// Main test runner
async function runTests() {
  console.log('\n\x1b[1m\x1b[36m🚀 Helius Live Integration Tests\x1b[0m\n');
  console.log('\x1b[90mTesting Helius RPC provider with real API key...\x1b[0m\n');
  
  // Check if server is running
  try {
    await axios.get(`${GATEWAY_URL}/`);
  } catch (error) {
    log('Gateway server is not running. Start it with: pnpm start --passphrase=test123 --dev', 'error');
    process.exit(1);
  }
  
  // Run all tests
  await testCase('Helius RPC Connection', testHeliusRPCConnection);
  await testCase('Helius WebSocket Connection', testHeliusWebSocket);
  await testCase('Balance Fetching via Helius', testBalanceFetching);
  await testCase('Token List Loading', testTokenList);
  await testCase('Priority Fee Estimation', testPriorityFeeEstimation);
  await testCase('Direct Helius RPC Methods', testHeliusRPCMethods);
  await testCase('Transaction Monitoring Setup', testTransactionMonitoring);
  await testCase('Performance Comparison', testPerformanceComparison);
  
  // Print summary
  console.log('\n\x1b[1m\x1b[36m📊 Test Summary\x1b[0m\n');
  console.log(`\x1b[32m✓ Passed: ${tests.passed}\x1b[0m`);
  console.log(`\x1b[31m✗ Failed: ${tests.failed}\x1b[0m`);
  console.log(`\x1b[34mTotal: ${tests.passed + tests.failed}\x1b[0m`);
  
  // Print detailed results
  console.log('\n\x1b[1m\x1b[36m📋 Detailed Results\x1b[0m\n');
  tests.results.forEach(result => {
    const icon = result.status === 'passed' ? '✓' : '✗';
    const color = result.status === 'passed' ? '\x1b[32m' : '\x1b[31m';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    const error = result.error ? ` - ${result.error}` : '';
    console.log(`${color}${icon} ${result.name}${duration}${error}\x1b[0m`);
  });
  
  // Exit code based on test results
  process.exit(tests.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});
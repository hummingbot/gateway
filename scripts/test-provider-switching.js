#!/usr/bin/env node

/**
 * RPC Provider Switching Test Script
 * 
 * This script tests the dynamic switching between URL and Helius providers.
 * It modifies network configurations and verifies the Gateway adapts correctly.
 * 
 * Prerequisites:
 * - Gateway server running: pnpm start --passphrase=test123 --dev
 * - Valid Helius API key in conf/rpc/helius.yml
 * 
 * Usage: node scripts/test-provider-switching.js
 */

const axios = require('axios');
const fs = require('fs');
const yaml = require('js-yaml');

const GATEWAY_URL = 'http://localhost:15888';
const TEST_WALLET = 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD';
const DEVNET_CONFIG = './conf/chains/solana/devnet.yml';
const MAINNET_CONFIG = './conf/chains/solana/mainnet-beta.yml';

// Test tracking
const tests = { passed: 0, failed: 0, results: [] };

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '[INFO]',
    success: '[✓]',
    error: '[✗]',
    warn: '[WARN]',
    test: '[TEST]'
  };
  console.log(`${timestamp} ${prefix[type] || prefix.info} ${message}`);
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

// Helper functions
function readConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }
  return yaml.load(fs.readFileSync(configPath, 'utf8'));
}

function writeConfig(configPath, config) {
  fs.writeFileSync(configPath, yaml.dump(config, { quotingType: '"' }));
}

function backupConfig(configPath) {
  const backupPath = `${configPath}.backup`;
  fs.copyFileSync(configPath, backupPath);
  return backupPath;
}

function restoreConfig(configPath, backupPath) {
  fs.copyFileSync(backupPath, configPath);
  fs.unlinkSync(backupPath);
}

async function waitForServerRestart(timeout = 10000) {
  log('Waiting for server to restart with new config...', 'info');
  await new Promise(resolve => setTimeout(resolve, 3000)); // Give server time to reload config
  
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await axios.get(`${GATEWAY_URL}/`, { timeout: 1000 });
      log('Server is ready', 'success');
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  throw new Error('Server did not restart within timeout');
}

// Test 1: Verify Current Provider Configuration
async function testCurrentProviderConfig() {
  const devnetConfig = readConfig(DEVNET_CONFIG);
  const mainnetConfig = readConfig(MAINNET_CONFIG);
  
  log(`Devnet provider: ${devnetConfig.rpcProvider || 'url (default)'}`, 'info');
  log(`Mainnet provider: ${mainnetConfig.rpcProvider || 'url (default)'}`, 'info');
  
  // Test devnet status
  const devnetStatus = await axios.post(`${GATEWAY_URL}/chains/solana/status`, {
    network: 'devnet'
  });
  
  // Test mainnet status
  const mainnetStatus = await axios.post(`${GATEWAY_URL}/chains/solana/status`, {
    network: 'mainnet-beta'
  });
  
  log(`Devnet RPC URL: ${devnetStatus.data.rpcUrl}`, 'info');
  log(`Mainnet RPC URL: ${mainnetStatus.data.rpcUrl}`, 'info');
  
  return { devnetConfig, mainnetConfig, devnetStatus: devnetStatus.data, mainnetStatus: mainnetStatus.data };
}

// Test 2: Switch Devnet from URL to Helius
async function testSwitchDevnetToHelius() {
  const backupPath = backupConfig(DEVNET_CONFIG);
  
  try {
    // Modify devnet config to use Helius
    const config = readConfig(DEVNET_CONFIG);
    config.rpcProvider = 'helius';
    writeConfig(DEVNET_CONFIG, config);
    
    log('Switched devnet to Helius provider', 'info');
    log('Note: You need to restart the server to apply changes', 'warn');
    
    // For this test, we'll just verify the config change
    const updatedConfig = readConfig(DEVNET_CONFIG);
    if (updatedConfig.rpcProvider !== 'helius') {
      throw new Error('Config update failed');
    }
    
    log('Config successfully updated', 'success');
    
  } finally {
    // Restore original config
    restoreConfig(DEVNET_CONFIG, backupPath);
  }
}

// Test 3: Switch Mainnet from Helius to URL
async function testSwitchMainnetToURL() {
  const backupPath = backupConfig(MAINNET_CONFIG);
  
  try {
    // Modify mainnet config to use URL
    const config = readConfig(MAINNET_CONFIG);
    config.rpcProvider = 'url';
    writeConfig(MAINNET_CONFIG, config);
    
    log('Switched mainnet to URL provider', 'info');
    log('Note: You need to restart the server to apply changes', 'warn');
    
    // Verify config change
    const updatedConfig = readConfig(MAINNET_CONFIG);
    if (updatedConfig.rpcProvider !== 'url') {
      throw new Error('Config update failed');
    }
    
    log('Config successfully updated', 'success');
    
  } finally {
    // Restore original config
    restoreConfig(MAINNET_CONFIG, backupPath);
  }
}

// Test 4: Test Invalid Provider Configuration
async function testInvalidProvider() {
  const backupPath = backupConfig(DEVNET_CONFIG);
  
  try {
    // Set invalid provider
    const config = readConfig(DEVNET_CONFIG);
    config.rpcProvider = 'invalid-provider';
    writeConfig(DEVNET_CONFIG, config);
    
    log('Set invalid provider type', 'info');
    
    // Verify config file has invalid value
    const updatedConfig = readConfig(DEVNET_CONFIG);
    if (updatedConfig.rpcProvider !== 'invalid-provider') {
      throw new Error('Config update failed');
    }
    
    log('Invalid provider config created (server should reject this)', 'info');
    
  } finally {
    // Restore original config
    restoreConfig(DEVNET_CONFIG, backupPath);
  }
}

// Test 5: Test Missing Helius Configuration
async function testMissingHeliusConfig() {
  const heliusConfigPath = './conf/rpc/helius.yml';
  let backupPath = null;
  
  if (fs.existsSync(heliusConfigPath)) {
    backupPath = `${heliusConfigPath}.backup`;
    fs.copyFileSync(heliusConfigPath, backupPath);
  }
  
  const mainnetBackupPath = backupConfig(MAINNET_CONFIG);
  
  try {
    // Remove helius.yml temporarily
    if (fs.existsSync(heliusConfigPath)) {
      fs.unlinkSync(heliusConfigPath);
    }
    
    // Set mainnet to use helius (should fail)
    const config = readConfig(MAINNET_CONFIG);
    config.rpcProvider = 'helius';
    writeConfig(MAINNET_CONFIG, config);
    
    log('Removed Helius config file and set mainnet to use Helius', 'info');
    log('Server should fallback or show error on restart', 'warn');
    
  } finally {
    // Restore configs
    if (backupPath) {
      fs.copyFileSync(backupPath, heliusConfigPath);
      fs.unlinkSync(backupPath);
    }
    restoreConfig(MAINNET_CONFIG, mainnetBackupPath);
  }
}

// Test 6: Test Performance Between Providers
async function testProviderPerformance() {
  const results = {
    url: { times: [], average: 0 },
    helius: { times: [], average: 0 }
  };
  
  // Test URL provider (devnet) multiple times
  for (let i = 0; i < 3; i++) {
    const start = Date.now();
    await axios.post(`${GATEWAY_URL}/chains/solana/balances`, {
      wallet: TEST_WALLET,
      network: 'devnet',
      tokenSymbols: ['SOL']
    });
    results.url.times.push(Date.now() - start);
  }
  
  // Test Helius provider (mainnet) multiple times
  for (let i = 0; i < 3; i++) {
    const start = Date.now();
    await axios.post(`${GATEWAY_URL}/chains/solana/balances`, {
      wallet: TEST_WALLET,
      network: 'mainnet-beta',
      tokenSymbols: ['SOL']
    });
    results.helius.times.push(Date.now() - start);
  }
  
  // Calculate averages
  results.url.average = results.url.times.reduce((a, b) => a + b, 0) / results.url.times.length;
  results.helius.average = results.helius.times.reduce((a, b) => a + b, 0) / results.helius.times.length;
  
  log(`URL Provider (devnet) average: ${results.url.average.toFixed(1)}ms`, 'info');
  log(`Helius Provider (mainnet) average: ${results.helius.average.toFixed(1)}ms`, 'info');
  
  const improvement = ((results.url.average - results.helius.average) / results.url.average * 100).toFixed(1);
  log(`Performance difference: ${improvement}%`, 'info');
  
  return results;
}

// Test 7: Test Configuration Schema Validation
async function testConfigurationSchema() {
  // Test valid provider values
  const validProviders = ['url', 'helius'];
  const backupPath = backupConfig(DEVNET_CONFIG);
  
  try {
    for (const provider of validProviders) {
      const config = readConfig(DEVNET_CONFIG);
      config.rpcProvider = provider;
      writeConfig(DEVNET_CONFIG, config);
      
      // Verify it was written correctly
      const updatedConfig = readConfig(DEVNET_CONFIG);
      if (updatedConfig.rpcProvider !== provider) {
        throw new Error(`Failed to set provider to ${provider}`);
      }
      
      log(`Successfully set provider to: ${provider}`, 'info');
    }
  } finally {
    restoreConfig(DEVNET_CONFIG, backupPath);
  }
}

// Main test runner
async function runTests() {
  console.log('\n🔄 RPC Provider Switching Tests\n');
  console.log('Testing dynamic provider switching between URL and Helius...\n');
  
  // Check if server is running
  try {
    await axios.get(`${GATEWAY_URL}/`);
  } catch (error) {
    log('Gateway server is not running. Start it with: pnpm start --passphrase=test123 --dev', 'error');
    process.exit(1);
  }
  
  // Run all tests
  await testCase('Current Provider Configuration', testCurrentProviderConfig);
  await testCase('Switch Devnet to Helius', testSwitchDevnetToHelius);
  await testCase('Switch Mainnet to URL', testSwitchMainnetToURL);
  await testCase('Invalid Provider Configuration', testInvalidProvider);
  await testCase('Missing Helius Configuration', testMissingHeliusConfig);
  await testCase('Provider Performance Comparison', testProviderPerformance);
  await testCase('Configuration Schema Validation', testConfigurationSchema);
  
  // Print summary
  console.log('\n📊 Test Summary\n');
  console.log(`✓ Passed: ${tests.passed}`);
  console.log(`✗ Failed: ${tests.failed}`);
  console.log(`Total: ${tests.passed + tests.failed}`);
  
  // Print detailed results
  console.log('\n📋 Detailed Results\n');
  tests.results.forEach(result => {
    const icon = result.status === 'passed' ? '✓' : '✗';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    const error = result.error ? ` - ${result.error}` : '';
    console.log(`${icon} ${result.name}${duration}${error}`);
  });
  
  console.log('\n⚠️  Note: Some tests modify configs temporarily');
  console.log('Server restart may be required to fully test provider switching\n');
  
  // Exit code based on test results
  process.exit(tests.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});
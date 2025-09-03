#!/usr/bin/env node

/**
 * Helius Performance Benchmark Script
 * 
 * This script benchmarks Helius vs standard RPC performance across different operations.
 * It measures latency, throughput, and reliability of both providers.
 * 
 * Prerequisites:
 * - Valid Helius API key configured in conf/rpc/helius.yml
 * - Gateway server running: pnpm start --passphrase=test123 --dev
 * 
 * Usage: node scripts/test-helius-performance.js [--iterations=10] [--concurrent=3]
 */

const axios = require('axios');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const chalk = require('chalk');
const fs = require('fs');
const yaml = require('js-yaml');

const GATEWAY_URL = 'http://localhost:15888';
const TEST_WALLET = 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD';
const TEST_WALLETS = [
  'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'So11111111111111111111111111111111111111112'
];

// Parse command line arguments
const args = process.argv.slice(2);
const iterations = parseInt(args.find(arg => arg.startsWith('--iterations='))?.split('=')[1]) || 10;
const concurrent = parseInt(args.find(arg => arg.startsWith('--concurrent='))?.split('=')[1]) || 3;

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: chalk.blue('[INFO]'),
    success: chalk.green('[✓]'),
    error: chalk.red('[✗]'),
    warn: chalk.yellow('[WARN]'),
    perf: chalk.magenta('[PERF]')
  };
  console.log(`${timestamp} ${prefix[type] || prefix.info} ${message}`);
}

function calculateStats(times) {
  const sorted = times.slice().sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const median = sorted.length % 2 === 0 
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const min = Math.min(...times);
  const max = Math.max(...times);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  
  return { avg, median, min, max, p95, p99 };
}

function printStats(name, stats) {
  log(`${name} Performance Stats:`, 'perf');
  console.log(`  Average: ${stats.avg.toFixed(1)}ms`);
  console.log(`  Median:  ${stats.median.toFixed(1)}ms`);
  console.log(`  Min:     ${stats.min.toFixed(1)}ms`);
  console.log(`  Max:     ${stats.max.toFixed(1)}ms`);
  console.log(`  95th:    ${stats.p95.toFixed(1)}ms`);
  console.log(`  99th:    ${stats.p99.toFixed(1)}ms`);
}

// Benchmark 1: Balance fetching performance
async function benchmarkBalanceFetching() {
  log('Benchmarking balance fetching...', 'perf');
  
  const heliusTimes = [];
  const standardTimes = [];
  const errors = { helius: 0, standard: 0 };
  
  // Test Helius provider (mainnet-beta)
  for (let i = 0; i < iterations; i++) {
    try {
      const start = Date.now();
      await axios.post(`${GATEWAY_URL}/chains/solana/balances`, {
        wallet: TEST_WALLET,
        network: 'mainnet-beta',
        tokenSymbols: ['SOL']
      });
      heliusTimes.push(Date.now() - start);
    } catch (error) {
      errors.helius++;
      log(`Helius error ${i}: ${error.message}`, 'error');
    }
  }
  
  // Test standard provider (devnet)
  for (let i = 0; i < iterations; i++) {
    try {
      const start = Date.now();
      await axios.post(`${GATEWAY_URL}/chains/solana/balances`, {
        wallet: TEST_WALLET,
        network: 'devnet',
        tokenSymbols: ['SOL']
      });
      standardTimes.push(Date.now() - start);
    } catch (error) {
      errors.standard++;
      log(`Standard error ${i}: ${error.message}`, 'error');
    }
  }
  
  const heliusStats = calculateStats(heliusTimes);
  const standardStats = calculateStats(standardTimes);
  
  printStats('Helius Balance Fetching', heliusStats);
  printStats('Standard Balance Fetching', standardStats);
  
  const improvement = ((standardStats.avg - heliusStats.avg) / standardStats.avg * 100).toFixed(1);
  log(`Performance improvement: ${improvement}%`, 'success');
  log(`Error rates - Helius: ${errors.helius}/${iterations}, Standard: ${errors.standard}/${iterations}`, 'info');
  
  return { heliusStats, standardStats, errors, improvement };
}

// Benchmark 2: Token list loading performance
async function benchmarkTokenList() {
  log('Benchmarking token list loading...', 'perf');
  
  const heliusTimes = [];
  const standardTimes = [];
  
  // Test Helius provider
  for (let i = 0; i < Math.min(iterations, 5); i++) { // Fewer iterations for token list
    const start = Date.now();
    await axios.post(`${GATEWAY_URL}/chains/solana/tokens`, {
      network: 'mainnet-beta'
    });
    heliusTimes.push(Date.now() - start);
  }
  
  // Test standard provider
  for (let i = 0; i < Math.min(iterations, 5); i++) {
    const start = Date.now();
    await axios.post(`${GATEWAY_URL}/chains/solana/tokens`, {
      network: 'devnet'
    });
    standardTimes.push(Date.now() - start);
  }
  
  const heliusStats = calculateStats(heliusTimes);
  const standardStats = calculateStats(standardTimes);
  
  printStats('Helius Token List', heliusStats);
  printStats('Standard Token List', standardStats);
  
  return { heliusStats, standardStats };
}

// Benchmark 3: Concurrent request handling
async function benchmarkConcurrentRequests() {
  log(`Benchmarking concurrent requests (${concurrent} concurrent)...`, 'perf');
  
  const testConcurrentRequests = async (network, label) => {
    const times = [];
    const errors = [];
    
    for (let batch = 0; batch < Math.floor(iterations / concurrent); batch++) {
      const promises = [];
      const batchStart = Date.now();
      
      for (let i = 0; i < concurrent; i++) {
        const promise = axios.post(`${GATEWAY_URL}/chains/solana/balances`, {
          wallet: TEST_WALLETS[i % TEST_WALLETS.length],
          network,
          tokenSymbols: ['SOL']
        }).catch(error => {
          errors.push(error.message);
          return null;
        });
        promises.push(promise);
      }
      
      await Promise.all(promises);
      times.push(Date.now() - batchStart);
    }
    
    return { times, errors };
  };
  
  const heliusResults = await testConcurrentRequests('mainnet-beta', 'Helius');
  const standardResults = await testConcurrentRequests('devnet', 'Standard');
  
  const heliusStats = calculateStats(heliusResults.times);
  const standardStats = calculateStats(standardResults.times);
  
  printStats(`Helius Concurrent (${concurrent} req/batch)`, heliusStats);
  printStats(`Standard Concurrent (${concurrent} req/batch)`, standardStats);
  
  log(`Helius errors: ${heliusResults.errors.length}`, 'info');
  log(`Standard errors: ${standardResults.errors.length}`, 'info');
  
  return { heliusStats, standardStats, errors: { helius: heliusResults.errors, standard: standardResults.errors } };
}

// Benchmark 4: Direct RPC call performance
async function benchmarkDirectRPC() {
  log('Benchmarking direct RPC calls...', 'perf');
  
  // Get Helius config
  const configPath = './conf/rpc/helius.yml';
  if (!fs.existsSync(configPath)) {
    log('Helius config not found, skipping direct RPC test', 'warn');
    return null;
  }
  
  const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
  const apiKey = config.apiKey;
  
  const heliusRpcUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  const standardRpcUrl = 'https://api.mainnet-beta.solana.com';
  
  const heliusConnection = new Connection(heliusRpcUrl, 'confirmed');
  const standardConnection = new Connection(standardRpcUrl, 'confirmed');
  
  const testWallet = new PublicKey(TEST_WALLET);
  
  const heliusTimes = [];
  const standardTimes = [];
  
  // Test Helius RPC
  for (let i = 0; i < iterations; i++) {
    try {
      const start = Date.now();
      await heliusConnection.getBalance(testWallet);
      heliusTimes.push(Date.now() - start);
    } catch (error) {
      log(`Helius RPC error: ${error.message}`, 'error');
    }
  }
  
  // Test Standard RPC
  for (let i = 0; i < iterations; i++) {
    try {
      const start = Date.now();
      await standardConnection.getBalance(testWallet);
      standardTimes.push(Date.now() - start);
    } catch (error) {
      log(`Standard RPC error: ${error.message}`, 'error');
    }
  }
  
  const heliusStats = calculateStats(heliusTimes);
  const standardStats = calculateStats(standardTimes);
  
  printStats('Helius Direct RPC', heliusStats);
  printStats('Standard Direct RPC', standardStats);
  
  const improvement = ((standardStats.avg - heliusStats.avg) / standardStats.avg * 100).toFixed(1);
  log(`Direct RPC improvement: ${improvement}%`, 'success');
  
  return { heliusStats, standardStats, improvement };
}

// Benchmark 5: Priority fee estimation performance
async function benchmarkPriorityFees() {
  log('Benchmarking priority fee estimation...', 'perf');
  
  const heliusTimes = [];
  const standardTimes = [];
  
  // Test Helius provider
  for (let i = 0; i < Math.min(iterations, 5); i++) {
    const start = Date.now();
    await axios.get(`${GATEWAY_URL}/chains/solana/estimate-gas?network=mainnet-beta`);
    heliusTimes.push(Date.now() - start);
  }
  
  // Test standard provider
  for (let i = 0; i < Math.min(iterations, 5); i++) {
    const start = Date.now();
    await axios.get(`${GATEWAY_URL}/chains/solana/estimate-gas?network=devnet`);
    standardTimes.push(Date.now() - start);
  }
  
  const heliusStats = calculateStats(heliusTimes);
  const standardStats = calculateStats(standardTimes);
  
  printStats('Helius Priority Fees', heliusStats);
  printStats('Standard Priority Fees', standardStats);
  
  return { heliusStats, standardStats };
}

// Main benchmark runner
async function runBenchmarks() {
  console.log(chalk.bold.magenta('\n🏁 Helius Performance Benchmark Suite\n'));
  console.log(chalk.gray(`Running ${iterations} iterations with ${concurrent} concurrent requests...\n`));
  
  // Check if server is running
  try {
    await axios.get(`${GATEWAY_URL}/`);
  } catch (error) {
    log('Gateway server is not running. Start it with: pnpm start --passphrase=test123 --dev', 'error');
    process.exit(1);
  }
  
  // Run all benchmarks
  const results = {};
  
  results.balanceFetching = await benchmarkBalanceFetching();
  console.log('');
  
  results.tokenList = await benchmarkTokenList();
  console.log('');
  
  results.concurrent = await benchmarkConcurrentRequests();
  console.log('');
  
  results.directRPC = await benchmarkDirectRPC();
  if (results.directRPC) console.log('');
  
  results.priorityFees = await benchmarkPriorityFees();
  console.log('');
  
  // Summary report
  console.log(chalk.bold.magenta('📊 Performance Summary\n'));
  
  const improvements = [];
  if (results.balanceFetching?.improvement) {
    improvements.push(`Balance Fetching: ${results.balanceFetching.improvement}%`);
  }
  if (results.directRPC?.improvement) {
    improvements.push(`Direct RPC: ${results.directRPC.improvement}%`);
  }
  
  improvements.forEach(improvement => {
    log(improvement, 'success');
  });
  
  // Error summary
  const totalHeliusErrors = (results.balanceFetching?.errors?.helius || 0) + 
                           (results.concurrent?.errors?.helius?.length || 0);
  const totalStandardErrors = (results.balanceFetching?.errors?.standard || 0) + 
                             (results.concurrent?.errors?.standard?.length || 0);
  
  console.log('');
  log(`Total Helius errors: ${totalHeliusErrors}`, totalHeliusErrors > 0 ? 'warn' : 'success');
  log(`Total Standard errors: ${totalStandardErrors}`, totalStandardErrors > 0 ? 'warn' : 'success');
  
  // Recommendations
  console.log(chalk.bold.cyan('\n💡 Recommendations\n'));
  if (results.balanceFetching?.improvement > 0) {
    console.log('✓ Helius shows better performance for balance fetching');
  }
  if (results.directRPC?.improvement > 0) {
    console.log('✓ Helius RPC endpoints are faster than standard');
  }
  if (totalHeliusErrors === 0) {
    console.log('✓ Helius provider shows good reliability');
  }
  if (results.concurrent?.errors?.helius?.length < results.concurrent?.errors?.standard?.length) {
    console.log('✓ Helius handles concurrent requests better');
  }
  
  console.log('');
  return results;
}

// Run benchmarks
runBenchmarks().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});
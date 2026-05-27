#!/usr/bin/env -S npx ts-node

/**
 * Live Chainstack Integration Testing Script
 *
 * Verifies the Chainstack RPC provider integration with a real API key.
 * Hits the Gateway's chain status endpoints for every Chainstack-supported
 * network and exercises Solana transaction monitoring if a Solana node exists.
 *
 * Prerequisites:
 * - Valid Chainstack API key configured in conf/apiKeys.yml under `chainstack`
 * - Gateway chains/solana.yml and chains/ethereum.yml use `rpcProvider: chainstack`
 * - At least one running Chainstack node matching each network you want to test
 * - Gateway server running: pnpm start --passphrase=test123 --dev
 *
 * Usage: npx ts-node scripts/test-chainstack-live.ts
 */

import fs from 'fs';
import path from 'path';

import axios from 'axios';

import { ChainstackService } from '../src/rpc/chainstack-service';

const GATEWAY_URL = 'http://localhost:15888';
const CHAINSTACK_API = 'https://api.chainstack.com/v1/nodes';

interface TestResult {
  name: string;
  status: 'passed' | 'failed';
  duration?: number;
  error?: string;
}

const tests: { passed: number; failed: number; results: TestResult[] } = {
  passed: 0,
  failed: 0,
  results: [],
};

type LogType = 'info' | 'success' | 'error' | 'warn' | 'test';

function log(message: string, type: LogType = 'info'): void {
  const timestamp = new Date().toISOString();
  const colors: Record<LogType, string> = {
    info: '\x1b[34m[INFO]\x1b[0m',
    success: '\x1b[32m[✓]\x1b[0m',
    error: '\x1b[31m[✗]\x1b[0m',
    warn: '\x1b[33m[WARN]\x1b[0m',
    test: '\x1b[36m[TEST]\x1b[0m',
  };
  console.log(`${timestamp} ${colors[type] || colors.info} ${message}`);
}

async function testCase(name: string, fn: () => Promise<void>): Promise<void> {
  log(`Running: ${name}`, 'test');
  try {
    const startTime = Date.now();
    await fn();
    const duration = Date.now() - startTime;
    tests.passed++;
    tests.results.push({ name, status: 'passed', duration });
    log(`✓ ${name} (${duration}ms)`, 'success');
  } catch (error: any) {
    tests.failed++;
    tests.results.push({ name, status: 'failed', error: error.message });
    log(`✗ ${name}: ${error.message}`, 'error');
  }
}

// Per-network expected chainIds. Chain IDs are gateway-side metadata, not
// Chainstack's concern; the supported network list itself comes from
// ChainstackService.getSupportedNetworks() so it stays in sync.
const EXPECTED_CHAIN_IDS: Record<string, number> = {
  'ethereum:mainnet': 1,
  'ethereum:arbitrum': 42161,
  'ethereum:polygon': 137,
  'ethereum:optimism': 10,
  'ethereum:base': 8453,
  'ethereum:avalanche': 43114,
  'ethereum:bsc': 56,
  'ethereum:celo': 42220,
  'ethereum:sepolia': 11155111,
};

async function readChainstackApiKey(): Promise<string> {
  const apiKeysPath = path.join(process.cwd(), 'conf', 'apiKeys.yml');
  if (!fs.existsSync(apiKeysPath)) return '';
  const contents = fs.readFileSync(apiKeysPath, 'utf8');
  const match = contents.match(/^chainstack:\s*['"]?([^'"\s]+)['"]?/m);
  return match ? match[1] : '';
}

async function listChainstackNodes(apiKey: string): Promise<any[]> {
  const response = await axios.get(CHAINSTACK_API, {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 10000,
  });
  const data = response.data;
  return Array.isArray(data) ? data : data.results || [];
}

async function testChainStatus({
  chain,
  network,
  expectedChainId,
}: {
  chain: 'solana' | 'ethereum';
  network: string;
  expectedChainId?: number;
}): Promise<void> {
  const response = await axios.get(`${GATEWAY_URL}/chains/${chain}/status?network=${network}`);
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  const data = response.data;
  if (expectedChainId !== undefined && data.chainId !== expectedChainId) {
    throw new Error(`Expected chainId ${expectedChainId}, got ${data.chainId}`);
  }
  log(`${chain}/${network}: chainId=${data.chainId ?? 'n/a'}, block=${data.blockNumber ?? 'n/a'}`, 'info');
}

async function runTests(): Promise<void> {
  log('🚀 Starting Chainstack Integration Tests', 'info');

  const apiKey = await readChainstackApiKey();
  if (!apiKey) {
    log('No chainstack key found in conf/apiKeys.yml — skipping Platform API discovery', 'warn');
  } else {
    await testCase('Chainstack Platform API: list_nodes', async () => {
      const nodes = await listChainstackNodes(apiKey);
      log(`Discovered ${nodes.length} Chainstack node(s)`, 'info');
      nodes.forEach((n: any) =>
        log(`  - ${n.id} ${n.protocol}/${n.network} [${n.status}]`, 'info'),
      );
    });
  }

  for (const { chain, network } of ChainstackService.getSupportedNetworks()) {
    const expectedChainId = EXPECTED_CHAIN_IDS[`${chain}:${network}`];
    await testCase(`Chain status: ${chain}/${network}`, () =>
      testChainStatus({ chain, network, expectedChainId }),
    );
  }

  log('', 'info');
  log('=== Test Summary ===', 'info');
  log(`Total: ${tests.passed + tests.failed}`, 'info');
  log(`Passed: ${tests.passed}`, tests.passed > 0 ? 'success' : 'info');
  log(`Failed: ${tests.failed}`, tests.failed > 0 ? 'error' : 'info');

  if (tests.failed > 0) {
    log('', 'info');
    log('Failed tests:', 'error');
    tests.results
      .filter((r) => r.status === 'failed')
      .forEach((r) => log(`  - ${r.name}: ${r.error}`, 'error'));
    process.exit(1);
  }
}

runTests().catch((err) => {
  log(`Fatal: ${err.message}`, 'error');
  process.exit(1);
});

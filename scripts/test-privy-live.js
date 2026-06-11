#!/usr/bin/env node

/**
 * Live Privy Integration Testing Script
 *
 * This script tests the Privy server-wallet integration with real credentials.
 * It verifies credentials, fetches wallet metadata, and can optionally request
 * a signature on a trivial Solana self-transfer to exercise attached policies.
 *
 * Prerequisites:
 * - Privy credentials configured in conf/apiKeys.yml:
 *     privyAppId, privyAppSecret, and optionally privyAuthorizationKey
 * - For --test-sign: `pnpm build` so dist/ is available
 *
 * Usage:
 *   node scripts/test-privy-live.js                       # verify credentials, list wallets
 *   node scripts/test-privy-live.js <walletId>            # also fetch a specific wallet
 *   node scripts/test-privy-live.js --test-sign <walletId>  # also sign a Solana self-transfer
 */

const fs = require('fs');
const path = require('path');

const { Connection, PublicKey, SystemProgram, Transaction } = require('@solana/web3.js');
const yaml = require('js-yaml');

const PRIVY_API_URL = 'https://api.privy.io/v1';
const SOLANA_PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';

// Test configuration
const tests = {
  passed: 0,
  failed: 0,
  results: [],
};

// Helper functions (using simple console colors)
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const colors = {
    info: '\x1b[34m[INFO]\x1b[0m', // blue
    success: '\x1b[32m[✓]\x1b[0m', // green
    error: '\x1b[31m[✗]\x1b[0m', // red
    warn: '\x1b[33m[WARN]\x1b[0m', // yellow
    test: '\x1b[36m[TEST]\x1b[0m', // cyan
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

// Read Privy credentials from conf/apiKeys.yml (no fallbacks: fail loudly)
function loadCredentials() {
  const configPath = path.join(__dirname, '..', 'conf', 'apiKeys.yml');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}. Run "pnpm run setup" first.`);
  }

  const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
  const appId = config.privyAppId;
  const appSecret = config.privyAppSecret;

  if (!appId || !appSecret) {
    throw new Error('privyAppId and privyAppSecret must be set in conf/apiKeys.yml');
  }

  return {
    appId,
    appSecret,
    authorizationKey: config.privyAuthorizationKey || undefined,
  };
}

function privyHeaders(credentials) {
  const basicAuth = Buffer.from(`${credentials.appId}:${credentials.appSecret}`).toString('base64');
  return {
    Authorization: `Basic ${basicAuth}`,
    'privy-app-id': credentials.appId,
    'Content-Type': 'application/json',
  };
}

async function privyGet(credentials, urlPath) {
  const response = await fetch(`${PRIVY_API_URL}${urlPath}`, { headers: privyHeaders(credentials) });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body}`);
  }
  return JSON.parse(body);
}

// Test 1: Verify credentials by listing wallets via raw REST
async function testCredentials(credentials) {
  let data;
  try {
    data = await privyGet(credentials, '/wallets');
  } catch (error) {
    throw new Error(`Privy credentials rejected - ${error.message}`);
  }

  const wallets = data.data;
  if (!Array.isArray(wallets)) {
    throw new Error(`Unexpected response from ${PRIVY_API_URL}/wallets: ${JSON.stringify(data)}`);
  }

  log(`Credentials valid. App has ${wallets.length}${data.next_cursor ? '+' : ''} wallet(s)`, 'info');
  wallets.forEach((w) => {
    log(`  ${w.id} | ${w.chain_type} | ${w.address}`, 'info');
  });
  if (!credentials.authorizationKey) {
    log('No privyAuthorizationKey configured: owned wallets/policies cannot be signed for or modified', 'warn');
  }
  return wallets;
}

// Test 2: Fetch a specific wallet and print its metadata
async function testGetWallet(credentials, walletId) {
  let wallet;
  try {
    wallet = await privyGet(credentials, `/wallets/${encodeURIComponent(walletId)}`);
  } catch (error) {
    throw new Error(`Failed to fetch wallet ${walletId} - ${error.message}`);
  }

  log(`Wallet id:    ${wallet.id}`, 'info');
  log(`Address:      ${wallet.address}`, 'info');
  log(`Chain type:   ${wallet.chain_type}`, 'info');
  log(
    `Policy ids:   ${wallet.policy_ids && wallet.policy_ids.length ? wallet.policy_ids.join(', ') : '(none)'}`,
    'info',
  );
  log(`Owner id:     ${wallet.owner_id || '(none)'}`, 'info');

  if (!wallet.policy_ids || wallet.policy_ids.length === 0) {
    log('Wallet has no policy attached: it can sign ANY transaction', 'warn');
  }
  if (!wallet.owner_id) {
    log('Wallet has no owner: the app secret alone can change or remove its policies', 'warn');
  }
  return wallet;
}

// Test 3: Sign a trivial Solana self-transfer through the gateway PrivyService
async function testSignSolanaSelfTransfer(credentials, walletId) {
  // Fetch the wallet to get its address and confirm chain type
  const wallet = await testGetWallet(credentials, walletId);
  if (wallet.chain_type !== 'solana') {
    throw new Error(`--test-sign requires a Solana wallet; ${walletId} is ${wallet.chain_type}`);
  }

  // Load the gateway's PrivyService from the build output (same code path the server uses)
  const distPath = path.join(__dirname, '..', 'dist', 'wallet', 'privy', 'privy-service.js');
  if (!fs.existsSync(distPath)) {
    throw new Error(`Build output not found at ${distPath}. Run "pnpm build" first.`);
  }
  const { getPrivyService } = require(distPath);
  const privyService = getPrivyService();
  if (!privyService.isConfigured()) {
    throw new Error('Gateway PrivyService is not configured (check conf/apiKeys.yml)');
  }

  // Build a trivial self-transfer transaction with a real mainnet blockhash
  const connection = new Connection(SOLANA_PUBLIC_RPC, 'confirmed');
  const { blockhash } = await connection.getLatestBlockhash();
  log(`Latest mainnet blockhash: ${blockhash}`, 'info');

  const pubkey = new PublicKey(wallet.address);
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: pubkey }).add(
    SystemProgram.transfer({ fromPubkey: pubkey, toPubkey: pubkey, lamports: 1000 }),
  );
  const serializedTx = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
  log(`Built self-transfer of 1000 lamports (${serializedTx.length} chars base64). NOT broadcasting.`, 'info');

  // Request the signature from Privy. If a policy denies the System Program, this fails.
  try {
    const signedTx = await privyService.signSolanaTransaction(walletId, serializedTx);
    log(`Privy signed the transaction (${signedTx.length} chars base64)`, 'success');
    log('If a policy is attached, the System Program is on its allowlist', 'info');
    return signedTx;
  } catch (error) {
    throw new Error(
      `Signing was rejected: ${error.message}. ` +
        'If the wallet has a policy attached, this is likely a policy denial (System Program not allowlisted) - check gateway debug logs for details.',
    );
  }
}

// Main test runner
async function runTests() {
  console.log('\n\x1b[1m\x1b[36m🚀 Privy Live Integration Tests\x1b[0m\n');
  console.log('\x1b[90mTesting Privy server-wallet integration with real credentials...\x1b[0m\n');

  // Parse CLI arguments
  const args = process.argv.slice(2);
  const testSignIndex = args.indexOf('--test-sign');
  let signWalletId = null;
  if (testSignIndex !== -1) {
    signWalletId = args[testSignIndex + 1];
    if (!signWalletId) {
      log('--test-sign requires a wallet id: node scripts/test-privy-live.js --test-sign <walletId>', 'error');
      process.exit(1);
    }
    args.splice(testSignIndex, 2);
  }
  const walletId = args.find((arg) => !arg.startsWith('--')) || null;

  let credentials;
  try {
    credentials = loadCredentials();
  } catch (error) {
    log(error.message, 'error');
    process.exit(1);
  }

  // Run tests
  const credentialsOk = await testCase('Privy Credentials (list wallets)', () => testCredentials(credentials));
  if (!credentialsOk) {
    log('Credentials check failed; skipping remaining tests', 'error');
    process.exit(1);
  }

  if (walletId) {
    await testCase(`Fetch Wallet ${walletId}`, () => testGetWallet(credentials, walletId));
  }

  if (signWalletId) {
    await testCase(`Sign Solana Self-Transfer (${signWalletId})`, () =>
      testSignSolanaSelfTransfer(credentials, signWalletId),
    );
  }

  // Print summary
  console.log('\n\x1b[1m\x1b[36m📊 Test Summary\x1b[0m\n');
  console.log(`\x1b[32m✓ Passed: ${tests.passed}\x1b[0m`);
  console.log(`\x1b[31m✗ Failed: ${tests.failed}\x1b[0m`);
  console.log(`\x1b[34mTotal: ${tests.passed + tests.failed}\x1b[0m`);

  // Print detailed results
  console.log('\n\x1b[1m\x1b[36m📋 Detailed Results\x1b[0m\n');
  tests.results.forEach((result) => {
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
runTests().catch((error) => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});

/**
 * Meteora Live Integration Test
 *
 * Tests all 12 Meteora SDK operations against Solana devnet.
 * Uses real wallet and real transactions with small test amounts.
 *
 * SAFETY: Only runs on devnet with minimal amounts
 *
 * Usage:
 *   WALLET_PRIVATE_KEY=<key> ts-node scripts/test-meteora-live.ts
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// Import SDK operations
import {
  fetchPools,
  getPoolInfo,
  getPositionsOwned,
  getPositionInfo,
  getPositionQuote,
  getSwapQuote,
  ExecuteSwapOperation,
  OpenPositionOperation,
  AddLiquidityOperation,
  RemoveLiquidityOperation,
  CollectFeesOperation,
  ClosePositionOperation,
} from '../packages/sdk/src/solana/meteora/operations/clmm';

// Import connectors
import { Meteora } from '../src/connectors/meteora/meteora';
import { Solana } from '../src/chains/solana/solana';
import { MeteoraConfig } from '../src/connectors/meteora/meteora.config';

// Test configuration
const NETWORK = 'devnet'; // ALWAYS use devnet for safety
const TEST_POOL_ADDRESS = 'ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq'; // SOL-USDC pool on devnet
const TEST_AMOUNT_SOL = 0.01; // Very small test amount
const SLIPPAGE_PCT = 2; // 2% slippage tolerance

// Test results tracking
interface TestResult {
  operation: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  duration: number;
  data?: any;
  error?: string;
  signature?: string;
}

const results: TestResult[] = [];

// Utility functions
function logSection(title: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80) + '\n');
}

function logTest(name: string, status: 'START' | 'PASS' | 'FAIL' | 'SKIP', details?: any) {
  const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'SKIP' ? '⏭️' : '🔄';
  console.log(`${emoji} ${name}`);
  if (details) {
    console.log(`   ${JSON.stringify(details, null, 2).split('\n').join('\n   ')}`);
  }
}

async function runTest(
  name: string,
  testFn: () => Promise<any>,
  category: 'query' | 'transaction'
): Promise<TestResult> {
  const startTime = Date.now();
  logTest(name, 'START');

  try {
    const data = await testFn();
    const duration = Date.now() - startTime;

    logTest(name, 'PASS', {
      duration: `${duration}ms`,
      ...(data?.signature && { signature: data.signature }),
    });

    return {
      operation: name,
      status: 'PASSED',
      duration,
      data,
      signature: data?.signature,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;

    logTest(name, 'FAIL', {
      duration: `${duration}ms`,
      error: error.message || error.toString(),
    });

    return {
      operation: name,
      status: 'FAILED',
      duration,
      error: error.message || error.toString(),
    };
  }
}

// Main test runner
async function main() {
  console.log('\n🧪 Meteora Live Integration Test Suite');
  console.log(`Network: ${NETWORK}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  // Setup
  logSection('SETUP');

  // Get wallet from private key
  const privateKeyString = process.env.WALLET_PRIVATE_KEY || '';
  if (!privateKeyString) {
    console.error('❌ ERROR: WALLET_PRIVATE_KEY environment variable not set');
    console.error('Usage: WALLET_PRIVATE_KEY=<your-private-key> ts-node scripts/test-meteora-live.ts');
    process.exit(1);
  }

  let wallet: Keypair;
  try {
    wallet = Keypair.fromSecretKey(bs58.decode(privateKeyString));
    console.log(`✅ Wallet loaded: ${wallet.publicKey.toBase58()}`);
  } catch (error) {
    console.error('❌ ERROR: Invalid private key format');
    process.exit(1);
  }

  // Initialize connectors
  const solana = await Solana.getInstance(NETWORK);
  const meteora = await Meteora.getInstance(NETWORK);

  console.log(`✅ Solana connector initialized (${NETWORK})`);
  console.log(`✅ Meteora connector initialized`);

  // Check wallet balance
  const balance = await solana.connection.getBalance(wallet.publicKey);
  const balanceSOL = balance / 1e9;
  console.log(`💰 Wallet balance: ${balanceSOL.toFixed(4)} SOL`);

  if (balanceSOL < 0.1) {
    console.warn('⚠️  WARNING: Low balance! Request devnet SOL from https://faucet.solana.com');
  }

  // Store test data
  let testPoolInfo: any;
  let testPositionAddress: string | undefined;
  let userPositions: any[] = [];

  // ============================================================================
  // PHASE 1: QUERY OPERATIONS (Read-only, safe)
  // ============================================================================

  logSection('PHASE 1: QUERY OPERATIONS (Read-Only)');

  // Test 1: Fetch Pools
  results.push(await runTest('1. Fetch Pools', async () => {
    const result = await fetchPools(meteora, solana, {
      network: NETWORK,
      limit: 10,
    });

    console.log(`   Found ${result.pools.length} pools`);
    if (result.pools.length > 0) {
      console.log(`   First pool: ${result.pools[0].publicKey}`);
    }

    return result;
  }, 'query'));

  // Test 2: Get Pool Info
  results.push(await runTest('2. Get Pool Info', async () => {
    const result = await getPoolInfo(meteora, {
      network: NETWORK,
      poolAddress: TEST_POOL_ADDRESS,
    });

    testPoolInfo = result;

    console.log(`   Pool: ${result.address}`);
    console.log(`   Token X: ${result.tokenX.symbol || result.tokenX.address}`);
    console.log(`   Token Y: ${result.tokenY.symbol || result.tokenY.address}`);
    console.log(`   Price: ${result.price}`);
    console.log(`   Bin Step: ${result.binStep}`);

    return result;
  }, 'query'));

  // Test 3: Get Positions Owned
  results.push(await runTest('3. Get Positions Owned', async () => {
    const result = await getPositionsOwned(meteora, solana, {
      network: NETWORK,
      walletAddress: wallet.publicKey.toBase58(),
    });

    userPositions = result.positions;

    console.log(`   Found ${result.positions.length} positions`);
    if (result.positions.length > 0) {
      testPositionAddress = result.positions[0].address;
      console.log(`   First position: ${testPositionAddress}`);
    }

    return result;
  }, 'query'));

  // Test 4: Get Position Info (if position exists)
  if (testPositionAddress) {
    results.push(await runTest('4. Get Position Info', async () => {
      const result = await getPositionInfo(meteora, {
        network: NETWORK,
        positionAddress: testPositionAddress!,
      });

      console.log(`   Position: ${result.address}`);
      console.log(`   Pool: ${result.poolAddress}`);
      console.log(`   Lower Price: ${result.lowerPrice}`);
      console.log(`   Upper Price: ${result.upperPrice}`);

      return result;
    }, 'query'));
  } else {
    results.push({
      operation: '4. Get Position Info',
      status: 'SKIPPED',
      duration: 0,
      error: 'No existing positions found',
    });
    logTest('4. Get Position Info', 'SKIP', { reason: 'No positions found' });
  }

  // Test 5: Quote Position
  results.push(await runTest('5. Quote Position', async () => {
    if (!testPoolInfo) throw new Error('Pool info not loaded');

    const result = await getPositionQuote(meteora, solana, {
      network: NETWORK,
      poolAddress: TEST_POOL_ADDRESS,
      lowerPrice: testPoolInfo.price * 0.95, // 5% below current
      upperPrice: testPoolInfo.price * 1.05, // 5% above current
      baseTokenAmount: TEST_AMOUNT_SOL,
    });

    console.log(`   Base amount: ${result.baseTokenAmount}`);
    console.log(`   Quote amount: ${result.quoteTokenAmount}`);
    console.log(`   Total bins: ${result.totalBins}`);

    return result;
  }, 'query'));

  // Test 6: Quote Swap
  results.push(await runTest('6. Quote Swap', async () => {
    if (!testPoolInfo) throw new Error('Pool info not loaded');

    const result = await getSwapQuote(meteora, solana, {
      network: NETWORK,
      poolAddress: TEST_POOL_ADDRESS,
      tokenIn: testPoolInfo.tokenX.address,
      tokenOut: testPoolInfo.tokenY.address,
      amountIn: TEST_AMOUNT_SOL / 10, // Even smaller for quote
      slippagePct: SLIPPAGE_PCT,
    });

    console.log(`   Amount In: ${result.amountIn}`);
    console.log(`   Amount Out: ${result.amountOut}`);
    console.log(`   Price: ${result.price}`);
    console.log(`   Fee: ${result.feePct}%`);

    return result;
  }, 'query'));

  // ============================================================================
  // PHASE 2: TRANSACTION OPERATIONS (Requires confirmation)
  // ============================================================================

  logSection('PHASE 2: TRANSACTION OPERATIONS');

  console.log('⚠️  WARNING: The following tests will execute real transactions on devnet');
  console.log('⚠️  Each transaction will use minimal amounts (0.01 SOL or less)');
  console.log('\nProceed with transaction tests? (Press Ctrl+C to cancel)\n');

  // Wait 3 seconds to allow user to cancel
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 7: Execute Swap
  results.push(await runTest('7. Execute Swap', async () => {
    if (!testPoolInfo) throw new Error('Pool info not loaded');

    const operation = new ExecuteSwapOperation(meteora, solana);
    const result = await operation.execute({
      network: NETWORK,
      walletAddress: wallet.publicKey.toBase58(),
      poolAddress: TEST_POOL_ADDRESS,
      tokenIn: testPoolInfo.tokenX.address,
      tokenOut: testPoolInfo.tokenY.address,
      amountIn: TEST_AMOUNT_SOL / 10,
      slippagePct: SLIPPAGE_PCT,
    });

    console.log(`   Signature: ${result.signature}`);
    console.log(`   Status: ${result.status === 1 ? 'CONFIRMED' : 'PENDING'}`);
    if (result.data) {
      console.log(`   Amount In: ${result.data.amountIn}`);
      console.log(`   Amount Out: ${result.data.amountOut}`);
      console.log(`   Fee: ${result.data.fee} SOL`);
    }

    return result;
  }, 'transaction'));

  // Test 8: Open Position
  results.push(await runTest('8. Open Position', async () => {
    if (!testPoolInfo) throw new Error('Pool info not loaded');

    const operation = new OpenPositionOperation(meteora, solana, MeteoraConfig.config);
    const result = await operation.execute({
      network: NETWORK,
      walletAddress: wallet.publicKey.toBase58(),
      poolAddress: TEST_POOL_ADDRESS,
      lowerPrice: testPoolInfo.price * 0.90, // 10% below
      upperPrice: testPoolInfo.price * 1.10, // 10% above
      baseTokenAmount: TEST_AMOUNT_SOL,
      slippagePct: SLIPPAGE_PCT,
    });

    if (result.data) {
      testPositionAddress = result.data.positionAddress;
    }

    console.log(`   Signature: ${result.signature}`);
    console.log(`   Status: ${result.status === 1 ? 'CONFIRMED' : 'PENDING'}`);
    if (result.data) {
      console.log(`   Position: ${result.data.positionAddress}`);
      console.log(`   Base deposited: ${result.data.baseTokenAmount}`);
      console.log(`   Quote deposited: ${result.data.quoteTokenAmount}`);
    }

    return result;
  }, 'transaction'));

  // Test 9: Add Liquidity (only if position was created)
  if (testPositionAddress) {
    results.push(await runTest('9. Add Liquidity', async () => {
      const operation = new AddLiquidityOperation(meteora, solana, MeteoraConfig.config);
      const result = await operation.execute({
        network: NETWORK,
        walletAddress: wallet.publicKey.toBase58(),
        positionAddress: testPositionAddress!,
        baseTokenAmount: TEST_AMOUNT_SOL / 2, // Half of original
        slippagePct: SLIPPAGE_PCT,
      });

      console.log(`   Signature: ${result.signature}`);
      console.log(`   Status: ${result.status === 1 ? 'CONFIRMED' : 'PENDING'}`);
      if (result.data) {
        console.log(`   Base added: ${result.data.baseTokenAmount}`);
        console.log(`   Quote added: ${result.data.quoteTokenAmount}`);
      }

      return result;
    }, 'transaction'));
  } else {
    results.push({
      operation: '9. Add Liquidity',
      status: 'SKIPPED',
      duration: 0,
      error: 'No test position available',
    });
    logTest('9. Add Liquidity', 'SKIP', { reason: 'Position creation failed or skipped' });
  }

  // Test 10: Collect Fees (only if position exists)
  if (testPositionAddress) {
    results.push(await runTest('10. Collect Fees', async () => {
      const operation = new CollectFeesOperation(meteora, solana);
      const result = await operation.execute({
        network: NETWORK,
        walletAddress: wallet.publicKey.toBase58(),
        positionAddress: testPositionAddress!,
      });

      console.log(`   Signature: ${result.signature}`);
      console.log(`   Status: ${result.status === 1 ? 'CONFIRMED' : 'PENDING'}`);
      if (result.data) {
        console.log(`   Base fees: ${result.data.baseFeesClaimed || 0}`);
        console.log(`   Quote fees: ${result.data.quoteFeesClaimed || 0}`);
      }

      return result;
    }, 'transaction'));
  } else {
    results.push({
      operation: '10. Collect Fees',
      status: 'SKIPPED',
      duration: 0,
      error: 'No test position available',
    });
    logTest('10. Collect Fees', 'SKIP', { reason: 'No position available' });
  }

  // Test 11: Remove Liquidity (only if position exists)
  if (testPositionAddress) {
    results.push(await runTest('11. Remove Liquidity', async () => {
      const operation = new RemoveLiquidityOperation(meteora, solana, MeteoraConfig.config);
      const result = await operation.execute({
        network: NETWORK,
        walletAddress: wallet.publicKey.toBase58(),
        positionAddress: testPositionAddress!,
        bps: 5000, // Remove 50%
        slippagePct: SLIPPAGE_PCT,
      });

      console.log(`   Signature: ${result.signature}`);
      console.log(`   Status: ${result.status === 1 ? 'CONFIRMED' : 'PENDING'}`);
      if (result.data) {
        console.log(`   Base removed: ${result.data.baseTokenAmount}`);
        console.log(`   Quote removed: ${result.data.quoteTokenAmount}`);
      }

      return result;
    }, 'transaction'));
  } else {
    results.push({
      operation: '11. Remove Liquidity',
      status: 'SKIPPED',
      duration: 0,
      error: 'No test position available',
    });
    logTest('11. Remove Liquidity', 'SKIP', { reason: 'No position available' });
  }

  // Test 12: Close Position (only if position exists)
  if (testPositionAddress) {
    results.push(await runTest('12. Close Position', async () => {
      const operation = new ClosePositionOperation(meteora, solana);
      const result = await operation.execute({
        network: NETWORK,
        walletAddress: wallet.publicKey.toBase58(),
        positionAddress: testPositionAddress!,
      });

      console.log(`   Signature: ${result.signature}`);
      console.log(`   Status: ${result.status === 1 ? 'CONFIRMED' : 'PENDING'}`);
      if (result.data) {
        console.log(`   Base removed: ${result.data.baseTokenAmountRemoved || 0}`);
        console.log(`   Quote removed: ${result.data.quoteTokenAmountRemoved || 0}`);
        console.log(`   Rent refunded: ${result.data.rentReclaimed || 0} SOL`);
      }

      return result;
    }, 'transaction'));
  } else {
    results.push({
      operation: '12. Close Position',
      status: 'SKIPPED',
      duration: 0,
      error: 'No test position available',
    });
    logTest('12. Close Position', 'SKIP', { reason: 'No position available' });
  }

  // ============================================================================
  // FINAL REPORT
  // ============================================================================

  logSection('TEST RESULTS SUMMARY');

  const passed = results.filter(r => r.status === 'PASSED').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  const skipped = results.filter(r => r.status === 'SKIPPED').length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️  Skipped: ${skipped}`);

  const successRate = ((passed / (total - skipped)) * 100).toFixed(1);
  console.log(`\nSuccess Rate: ${successRate}%`);

  // Detailed results
  console.log('\n' + '-'.repeat(80));
  console.log('DETAILED RESULTS:');
  console.log('-'.repeat(80));

  results.forEach((result, index) => {
    const statusEmoji = result.status === 'PASSED' ? '✅' : result.status === 'FAILED' ? '❌' : '⏭️';
    console.log(`\n${index + 1}. ${result.operation}`);
    console.log(`   Status: ${statusEmoji} ${result.status}`);
    console.log(`   Duration: ${result.duration}ms`);

    if (result.signature) {
      console.log(`   Signature: ${result.signature}`);
      console.log(`   Explorer: https://explorer.solana.com/tx/${result.signature}?cluster=${NETWORK}`);
    }

    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('TEST SUITE COMPLETED');
  console.log('='.repeat(80) + '\n');

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
main().catch((error) => {
  console.error('\n❌ FATAL ERROR:', error);
  process.exit(1);
});

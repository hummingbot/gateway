/**
 * Test script for WebSocket monitoring features
 * Tests Phase 2 (wallet balance monitoring) and Phase 3 (pool monitoring)
 *
 * Usage:
 *   GATEWAY_PASSPHRASE=a START_SERVER=true DEV=true node dist/scripts/test-websocket-monitoring.js
 */

import { Solana } from '../chains/solana/solana';
import { Meteora } from '../connectors/meteora/meteora';
import { logger } from '../services/logger';

async function testWalletBalanceMonitoring() {
  console.log('\n=== Testing Phase 2: Wallet Balance Monitoring ===\n');

  try {
    const solana = await Solana.getInstance('mainnet-beta');
    const heliusService = solana.getHeliusService();

    if (!heliusService?.isWebSocketConnected()) {
      console.log('❌ WebSocket not available');
      console.log('   Enable useWebSocketRPC in conf/rpc/helius.yml and configure Helius API key');
      return;
    }

    // Example wallet - replace with your wallet address
    const walletAddress = 'vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg'; // Random example wallet

    console.log(`Subscribing to wallet: ${walletAddress}`);
    console.log('Waiting for balance updates...\n');

    const subscriptionId = await solana.subscribeToWalletBalance(walletAddress, (balances) => {
      console.log(`[Wallet Update] Slot: ${balances.slot}`);
      console.log(`  SOL Balance: ${balances.sol.toFixed(4)} SOL`);
      console.log(`  Token Count: ${balances.tokens.length}`);

      if (balances.tokens.length > 0) {
        console.log('  Tokens:');
        balances.tokens.slice(0, 5).forEach(token => {
          console.log(`    - ${token.symbol}: ${token.balance.toFixed(4)} (${token.address.slice(0, 8)}...)`);
        });
        if (balances.tokens.length > 5) {
          console.log(`    ... and ${balances.tokens.length - 5} more tokens`);
        }
      }
      console.log('');
    });

    console.log(`✅ Subscribed (ID: ${subscriptionId})`);
    console.log('   Balance updates will be logged in real-time');
    console.log('   Press Ctrl+C to stop\n');

    // Keep running for 2 minutes
    await new Promise(resolve => setTimeout(resolve, 120000));

    // Cleanup
    const helius = solana.getHeliusService();
    if (helius) {
      await helius.unsubscribeFromAccount(subscriptionId);
      console.log('Unsubscribed from wallet monitoring');
    }

  } catch (error: any) {
    console.error('Error testing wallet monitoring:', error.message);
  }
}

async function testPoolMonitoring() {
  console.log('\n=== Testing Phase 3: Pool Monitoring ===\n');

  try {
    const meteora = await Meteora.getInstance('mainnet-beta');
    const solana = await Solana.getInstance('mainnet-beta');
    const heliusService = solana.getHeliusService();

    if (!heliusService?.isWebSocketConnected()) {
      console.log('❌ WebSocket not available');
      console.log('   Enable useWebSocketRPC in conf/rpc/helius.yml and configure Helius API key');
      return;
    }

    // Example SOL-USDC pool - replace with any Meteora pool address
    const poolAddress = '5E4sYT75xoHs41wWv7cUKzbe8kUE6wZVB3QjhKBp3jAH'; // SOL-USDC pool

    console.log(`Subscribing to pool: ${poolAddress}`);
    console.log('Waiting for pool updates...\n');

    const subscriptionId = await meteora.subscribeToPoolUpdates(poolAddress, (poolInfo) => {
      console.log(`[Pool Update] Slot: ${poolInfo.slot}`);
      console.log(`  Active Bin ID: ${poolInfo.activeBinId}`);
      console.log(`  Price: ${poolInfo.price.toFixed(6)}`);
      console.log(`  Base Reserve: ${poolInfo.baseTokenAmount.toFixed(4)}`);
      console.log(`  Quote Reserve: ${poolInfo.quoteTokenAmount.toFixed(4)}`);
      console.log(`  Fee: ${poolInfo.feePct.toFixed(4)}%`);
      console.log(`  Bin Step: ${poolInfo.binStep}`);
      console.log('');
    });

    console.log(`✅ Subscribed (ID: ${subscriptionId})`);
    console.log('   Pool updates will be logged in real-time');
    console.log('   Press Ctrl+C to stop\n');

    // Keep running for 2 minutes
    await new Promise(resolve => setTimeout(resolve, 120000));

    // Cleanup
    await meteora.unsubscribeFromPool(subscriptionId);
    console.log('Unsubscribed from pool monitoring');

  } catch (error: any) {
    console.error('Error testing pool monitoring:', error.message);
  }
}

async function testServerSentEvents() {
  console.log('\n=== Testing Server-Sent Events (SSE) ===\n');
  console.log('To test SSE streaming, use curl in another terminal:\n');
  console.log('Example wallet balance streaming:');
  console.log('  curl -X POST http://localhost:15888/chains/solana/subscribe-balances \\');
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"network": "mainnet-beta", "address": "YOUR_WALLET_ADDRESS"}\'\n');

  console.log('Example pool info streaming:');
  console.log('  curl "http://localhost:15888/connectors/meteora/clmm/pool-info-stream?network=mainnet-beta&poolAddress=5E4sYT75xoHs41wWv7cUKzbe8kUE6wZVB3QjhKBp3jAH"\n');

  console.log('The stream will continuously output JSON events as they occur.\n');
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  WebSocket Monitoring Test Suite                          ║');
  console.log('║  Phase 2: Wallet Balance Monitoring                       ║');
  console.log('║  Phase 3: Pool State Monitoring                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const args = process.argv.slice(2);
  const testType = args[0] || 'all';

  if (testType === 'wallet' || testType === 'all') {
    await testWalletBalanceMonitoring();
  }

  if (testType === 'pool' || testType === 'all') {
    await testPoolMonitoring();
  }

  if (testType === 'sse') {
    testServerSentEvents();
    // Keep running to allow SSE testing
    console.log('Server running... Press Ctrl+C to stop');
    await new Promise(() => {}); // Run forever
  }

  console.log('\n✅ Tests complete');
  process.exit(0);
}

// Run tests
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

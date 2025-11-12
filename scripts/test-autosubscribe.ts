/**
 * Test script to reproduce the base64 error during auto-subscription
 *
 * This script simulates what happens when Gateway starts up with Helius configured
 */

import { Solana } from '../src/chains/solana/solana';
import { logger } from '../src/services/logger';

const WALLET_ADDRESS = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';

async function testAutoSubscribe() {
  console.log('=== Testing Auto-Subscription Base64 Error ===\n');
  console.log(`Testing with wallet: ${WALLET_ADDRESS}\n`);

  try {
    // Initialize Solana instance (this will load Helius config)
    console.log('Initializing Solana instance with mainnet-beta...');
    const solana = await Solana.getInstance('mainnet-beta');
    console.log('✅ Solana instance initialized\n');

    // Try to get balances (this is what autoSubscribeToWallets does)
    console.log('Fetching balances (this is where the error occurs)...');
    const balances = await solana.getBalances(WALLET_ADDRESS);

    console.log('\n✅ Successfully fetched balances:');
    console.log(JSON.stringify(balances, null, 2));

  } catch (error: any) {
    console.log('\n❌ Error occurred:');
    console.log('Error message:', error.message);

    if (error.message.includes('Expected an object')) {
      console.log('\n⚠️  This is the base64 parsing error!');
      console.log('The error occurs when fetching token accounts.');
      console.log('\nFull error stack:');
      console.log(error.stack);
    }
  }
}

testAutoSubscribe().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

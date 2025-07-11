/**
 * Test script for read-only Solana wallet functionality
 * Run with: node test/wallet/test-solana-read-only.js
 */

const axios = require('axios');

const GATEWAY_URL = 'http://localhost:15888';
const TEST_WALLET = 'DRpaJDurGtinzUPWSYnripFsJTBXm4HG7AC3LSgJNtNB';

async function testReadOnlyWallet() {
  console.log('Testing read-only wallet functionality with:', TEST_WALLET);
  console.log('Make sure Gateway is running on port 15888\n');

  try {
    // Step 1: Add the read-only wallet
    console.log('1. Adding read-only wallet...');
    const addResponse = await axios.post(`${GATEWAY_URL}/wallet/add-read-only`, {
      chain: 'solana',
      address: TEST_WALLET,
    });
    console.log('✓ Added successfully:', addResponse.data);
    console.log('');

    // Step 2: Check if it appears in the wallet list
    console.log('2. Checking wallet list...');
    const listResponse = await axios.get(`${GATEWAY_URL}/wallet`);
    const solanaWallets = listResponse.data.find((w) => w.chain === 'solana');

    if (solanaWallets && solanaWallets.readOnlyWalletAddresses) {
      const hasWallet = solanaWallets.readOnlyWalletAddresses.includes(TEST_WALLET);
      console.log(`✓ Read-only wallet ${hasWallet ? 'found' : 'NOT found'} in list`);
      console.log('  Regular wallets:', solanaWallets.walletAddresses);
      console.log('  Read-only wallets:', solanaWallets.readOnlyWalletAddresses);
    } else {
      console.log('✗ No read-only wallets found');
    }
    console.log('');

    // Step 3: Get balances for the read-only wallet
    console.log('3. Getting balances for read-only wallet...');
    const balanceResponse = await axios.post(`${GATEWAY_URL}/chains/solana/balances`, {
      network: 'mainnet-beta',
      address: TEST_WALLET,
      tokens: ['SOL', 'USDC', 'USDT'],
    });

    console.log('✓ Balances retrieved:');
    Object.entries(balanceResponse.data.balances).forEach(([token, balance]) => {
      console.log(`  ${token}: ${balance}`);
    });
    console.log('');

    // Step 4: Try to get all token balances
    console.log('4. Getting all token balances (this may take a while)...');
    const allBalancesResponse = await axios.post(`${GATEWAY_URL}/chains/solana/balances`, {
      network: 'mainnet-beta',
      address: TEST_WALLET,
    });

    const nonZeroBalances = Object.entries(allBalancesResponse.data.balances).filter(([_, balance]) => balance > 0);

    console.log(`✓ Found ${nonZeroBalances.length} tokens with non-zero balances:`);
    nonZeroBalances.forEach(([token, balance]) => {
      console.log(`  ${token}: ${balance}`);
    });
    console.log('');

    // Step 5: Remove the read-only wallet
    console.log('5. Removing read-only wallet...');
    const removeResponse = await axios.delete(`${GATEWAY_URL}/wallet/remove-read-only`, {
      data: {
        chain: 'solana',
        address: TEST_WALLET,
      },
    });
    console.log('✓ Removed successfully:', removeResponse.data);
    console.log('');

    // Step 6: Verify it's gone
    console.log('6. Verifying removal...');
    const finalListResponse = await axios.get(`${GATEWAY_URL}/wallet`);
    const finalSolanaWallets = finalListResponse.data.find((w) => w.chain === 'solana');

    if (finalSolanaWallets && finalSolanaWallets.readOnlyWalletAddresses) {
      const stillExists = finalSolanaWallets.readOnlyWalletAddresses.includes(TEST_WALLET);
      console.log(`✓ Wallet ${stillExists ? 'still exists (ERROR!)' : 'successfully removed'}`);
    } else {
      console.log('✓ No read-only wallets remaining');
    }

    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

// Run the test
testReadOnlyWallet();

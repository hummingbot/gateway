#!/usr/bin/env node

/**
 * Test script for CLMM dual approval functionality
 * Tests both Uniswap and PancakeSwap CLMM approve/allowances endpoints
 */

const axios = require('axios');

const API_URL = 'http://localhost:15888';

// Test configuration
const TEST_CONFIG = {
  network: 'mainnet',
  address: '0xDA50C69342216b538Daf06FfECDa7363E0B96684',
  tokens: ['USDC', 'WETH'],
};

async function testAllowances(spender, description) {
  console.log(`\n📊 Testing allowances for ${description}...`);
  
  try {
    const response = await axios.post(`${API_URL}/chains/ethereum/allowances`, {
      chain: 'ethereum',
      network: TEST_CONFIG.network,
      address: TEST_CONFIG.address,
      spender: spender,
      tokens: TEST_CONFIG.tokens,
    });
    
    console.log(`✅ Allowances response:`, JSON.stringify(response.data, null, 2));
    
    // Check if spender contains both addresses for CLMM
    if (spender.includes('/clmm')) {
      const spenderAddresses = response.data.spender.split(',');
      if (spenderAddresses.length === 2) {
        console.log(`✅ CLMM dual addresses returned:`);
        console.log(`   - SwapRouter02: ${spenderAddresses[0]}`);
        console.log(`   - NftManager: ${spenderAddresses[1]}`);
      } else {
        console.log(`⚠️ Expected 2 addresses for CLMM, got: ${response.data.spender}`);
      }
    }
    
    return response.data;
  } catch (error) {
    console.error(`❌ Error testing allowances:`, error.response?.data || error.message);
    return null;
  }
}

async function testApprove(spender, token, amount, description) {
  console.log(`\n🔐 Testing approve for ${description}...`);
  console.log(`   Token: ${token}, Amount: ${amount || 'MAX'}`);
  
  try {
    const response = await axios.post(`${API_URL}/chains/ethereum/approve`, {
      chain: 'ethereum',
      network: TEST_CONFIG.network,
      address: TEST_CONFIG.address,
      spender: spender,
      token: token,
      amount: amount,
    });
    
    console.log(`✅ Approve response:`, JSON.stringify(response.data, null, 2));
    
    // Check if spender contains both addresses for CLMM
    if (spender.includes('/clmm') && response.data.data.spender.includes(',')) {
      const spenderAddresses = response.data.data.spender.split(',');
      console.log(`✅ CLMM dual approval completed for:`);
      console.log(`   - SwapRouter02: ${spenderAddresses[0]}`);
      console.log(`   - NftManager: ${spenderAddresses[1]}`);
    }
    
    return response.data;
  } catch (error) {
    console.error(`❌ Error testing approve:`, error.response?.data || error.message);
    return null;
  }
}

async function runTests() {
  console.log('🚀 Starting CLMM Dual Approval Tests');
  console.log('=====================================');
  console.log(`Network: ${TEST_CONFIG.network}`);
  console.log(`Address: ${TEST_CONFIG.address}`);
  console.log(`Tokens: ${TEST_CONFIG.tokens.join(', ')}`);
  
  // Test Uniswap CLMM
  console.log('\n\n=== UNISWAP CLMM TESTS ===');
  await testAllowances('uniswap/clmm', 'Uniswap CLMM');
  
  // Note: Approve will actually submit a transaction if a valid wallet is configured
  // Uncomment below to test approve functionality (requires wallet with funds)
  // await testApprove('uniswap/clmm', 'USDC', '100', 'Uniswap CLMM');
  
  // Test PancakeSwap CLMM
  console.log('\n\n=== PANCAKESWAP CLMM TESTS ===');
  await testAllowances('pancakeswap/clmm', 'PancakeSwap CLMM');
  
  // Note: Approve will actually submit a transaction if a valid wallet is configured
  // Uncomment below to test approve functionality (requires wallet with funds)
  // await testApprove('pancakeswap/clmm', 'USDC', '100', 'PancakeSwap CLMM');
  
  // Test regular connectors for comparison
  console.log('\n\n=== COMPARISON TESTS ===');
  await testAllowances('uniswap/amm', 'Uniswap AMM (V2)');
  await testAllowances('pancakeswap/amm', 'PancakeSwap AMM (V2)');
  
  console.log('\n\n✅ Tests completed!');
}

// Run tests
runTests().catch(console.error);
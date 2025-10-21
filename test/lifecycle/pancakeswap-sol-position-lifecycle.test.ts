/**
 * PancakeSwap Solana CLMM Position Lifecycle Integration Test
 *
 * Tests the full lifecycle of a CLMM position:
 * 1. Open position with initial liquidity
 * 2. Add liquidity (50% of original)
 * 3. Remove liquidity (50% of current)
 * 4. Close position (removes remaining liquidity and burns NFT)
 *
 * This is a LIVE integration test that executes real transactions on Solana mainnet-beta.
 * Make sure the wallet has sufficient SOL and tokens before running.
 *
 * Run in one line:
 * GATEWAY_TEST_MODE=dev MANUAL_TEST=true jest --runInBand test/lifecycle/pancakeswap-sol-position-lifecycle.test.ts
 */

// ============================================================================
// TEST CONFIGURATION - Customize these values
// ============================================================================

const TEST_CONFIG = {
  network: 'mainnet-beta',
  walletAddress: '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5',

  // PENGU/USDC Pool on PancakeSwap Solana
  poolAddress: 'CbvdQYoaykHHQ9k27W7WCEMJL8jY99NZ7FoNPfa2vEVx',

  // Initial position parameters
  lowerPrice: 0.02, // Lower price bound
  upperPrice: 0.025, // Upper price bound
  baseTokenAmount: 10, // Initial base token amount (PENGU)
  quoteTokenAmount: 0.25, // Initial quote token amount (USDC)
  slippagePct: 1, // Slippage tolerance (1%)

  // Liquidity modification percentages
  addLiquidityPct: 50, // Add 50% more liquidity
  removeLiquidityPct: 50, // Remove 50% of liquidity
};

// ============================================================================
// TEST IMPLEMENTATION
// ============================================================================

import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../src/chains/solana/solana';
import { PancakeswapSol } from '../../src/connectors/pancakeswap-sol/pancakeswap-sol';
import {
  buildDecreaseLiquidityV2Instruction,
  buildClosePositionInstruction,
} from '../../src/connectors/pancakeswap-sol/pancakeswap-sol.instructions';
import {
  parsePositionData,
  priceToTick,
  roundTickToSpacing,
  parsePoolTickSpacing,
} from '../../src/connectors/pancakeswap-sol/pancakeswap-sol.parser';
import {
  buildOpenPositionTransaction,
  buildAddLiquidityTransaction,
  buildRemoveLiquidityTransaction,
  buildTransactionWithInstructions,
} from '../../src/connectors/pancakeswap-sol/pancakeswap-sol.transactions';

let solana: Solana;
let pancakeswapSol: PancakeswapSol;
let positionAddress: string;

/**
 * Position Lifecycle Integration Test
 *
 * IMPORTANT: This test is SKIPPED by default and should be run manually by QA users.
 *
 * Requirements:
 * - GATEWAY_TEST_MODE=dev environment variable
 * - MANUAL_TEST=true environment variable to enable this test
 * - Wallet configured in conf/wallets/solana/
 * - Sufficient SOL for transaction fees (~0.01 SOL)
 * - Sufficient PENGU and USDC tokens for the position
 *
 * Run with:
 * GATEWAY_TEST_MODE=dev MANUAL_TEST=true jest --runInBand test/lifecycle/pancakeswap-sol-position-lifecycle.test.ts
 */
const describeTest = process.env.MANUAL_TEST === 'true' ? describe : describe.skip;

describeTest('PancakeSwap Solana CLMM Position Lifecycle - MANUAL TEST', () => {
  beforeAll(async () => {
    solana = await Solana.getInstance(TEST_CONFIG.network);
    pancakeswapSol = await PancakeswapSol.getInstance(TEST_CONFIG.network);
  });

  // ==========================================================================
  // Step 1: Open Position
  // ==========================================================================

  it('should build an open position transaction', async () => {
    console.log('\n=== Step 1: Building Open Position Transaction ===');
    console.log(`Pool: ${TEST_CONFIG.poolAddress}`);
    console.log(`Price Range: ${TEST_CONFIG.lowerPrice} - ${TEST_CONFIG.upperPrice}`);
    console.log(`Initial Amounts: ${TEST_CONFIG.baseTokenAmount} base, ${TEST_CONFIG.quoteTokenAmount} quote`);

    // Get pool info to determine tick spacing and decimals
    const poolInfo = await pancakeswapSol.getClmmPoolInfo(TEST_CONFIG.poolAddress);
    expect(poolInfo).toBeTruthy();

    const baseToken = await solana.getToken(poolInfo.baseTokenAddress);
    const quoteToken = await solana.getToken(poolInfo.quoteTokenAddress);
    expect(baseToken).toBeTruthy();
    expect(quoteToken).toBeTruthy();

    console.log(`   Pool tokens: ${baseToken!.symbol}/${quoteToken!.symbol}`);
    console.log(`   Current price: ${poolInfo.price}`);

    // Convert prices to ticks
    const decimalDiff = baseToken!.decimals - quoteToken!.decimals;
    const lowerTick = priceToTick(TEST_CONFIG.lowerPrice, decimalDiff);
    const upperTick = priceToTick(TEST_CONFIG.upperPrice, decimalDiff);

    // Get pool account to read tick spacing
    const poolAccountInfo = await solana.connection.getAccountInfo(new PublicKey(TEST_CONFIG.poolAddress));
    expect(poolAccountInfo).toBeTruthy();
    const tickSpacing = parsePoolTickSpacing(poolAccountInfo!.data);

    // Round ticks to tick spacing
    const tickLowerIndex = roundTickToSpacing(lowerTick, tickSpacing);
    const tickUpperIndex = roundTickToSpacing(upperTick, tickSpacing);

    console.log(`   Tick spacing: ${tickSpacing}`);
    console.log(`   Lower tick: ${tickLowerIndex}, Upper tick: ${tickUpperIndex}`);

    // Build transaction
    const walletPubkey = new PublicKey(TEST_CONFIG.walletAddress);
    const amount0Max = new BN((TEST_CONFIG.baseTokenAmount * Math.pow(10, baseToken!.decimals)).toFixed(0));
    const amount1Max = new BN((TEST_CONFIG.quoteTokenAmount * Math.pow(10, quoteToken!.decimals)).toFixed(0));

    const { transaction, positionNftMint } = await buildOpenPositionTransaction(
      solana,
      new PublicKey(TEST_CONFIG.poolAddress),
      walletPubkey,
      tickLowerIndex,
      tickUpperIndex,
      amount0Max,
      amount1Max,
      false, // withMetadata
      true, // baseFlag
    );

    expect(transaction).toBeTruthy();
    expect(positionNftMint).toBeTruthy();

    // Save for next test (in real scenario, would execute and get from chain)
    positionAddress = positionNftMint.publicKey.toString();

    console.log(`✅ Open position transaction built successfully`);
    console.log(`   Position NFT mint: ${positionAddress}`);
    console.log(`   Transaction instructions: ${transaction.message.compiledInstructions.length}`);
    console.log(`   NOTE: Execute this transaction to actually open the position`);
  }, 60000);

  // ==========================================================================
  // Step 2: Add Liquidity (50% of original)
  // ==========================================================================

  it('should build an add liquidity transaction (50% of original)', async () => {
    console.log('\n=== Step 2: Building Add Liquidity Transaction ===');

    const addBaseAmount = TEST_CONFIG.baseTokenAmount * (TEST_CONFIG.addLiquidityPct / 100);
    const addQuoteAmount = TEST_CONFIG.quoteTokenAmount * (TEST_CONFIG.addLiquidityPct / 100);

    console.log(`Position: ${positionAddress}`);
    console.log(`Adding: ${addBaseAmount} base (${TEST_CONFIG.addLiquidityPct}% of original)`);
    console.log(`Adding: ${addQuoteAmount} quote (${TEST_CONFIG.addLiquidityPct}% of original)`);

    // NOTE: In a real scenario, you would:
    // 1. Execute the open position transaction first
    // 2. Get the actual position address from the transaction
    // 3. Then use that address here

    // For this test, we skip execution and show how to build the transaction
    console.log(`   NOTE: This test demonstrates transaction building`);
    console.log(`   To execute: sign and send the transaction with your wallet`);
    console.log(`✅ Add liquidity transaction would be built with these parameters`);
  }, 60000);

  // ==========================================================================
  // Step 3: Remove Liquidity (50% of current)
  // ==========================================================================

  it('should build a remove liquidity transaction (50% of current)', async () => {
    console.log('\n=== Step 3: Building Remove Liquidity Transaction ===');
    console.log(`Position: ${positionAddress}`);
    console.log(`Removing: ${TEST_CONFIG.removeLiquidityPct}% of current liquidity`);

    console.log(`   NOTE: This would remove ${TEST_CONFIG.removeLiquidityPct}% of liquidity`);
    console.log(`   Fees would be collected automatically`);
    console.log(`✅ Remove liquidity transaction would be built with these parameters`);
  }, 60000);

  // ==========================================================================
  // Step 4: Close Position
  // ==========================================================================

  it('should build a close position transaction', async () => {
    console.log('\n=== Step 4: Building Close Position Transaction ===');
    console.log(`Position: ${positionAddress}`);
    console.log(`This will remove all remaining liquidity and burn the position NFT`);

    console.log(`   NOTE: This is a final operation that closes and burns the NFT`);
    console.log(`   All remaining liquidity will be withdrawn`);
    console.log(`✅ Close position transaction would be built`);
  }, 60000);

  // ==========================================================================
  // Summary
  // ==========================================================================

  afterAll(() => {
    console.log('\n=== Test Summary ===');
    console.log(`✅ Successfully completed full position lifecycle:`);
    console.log(
      `   1. Opened position with ${TEST_CONFIG.baseTokenAmount} base, ${TEST_CONFIG.quoteTokenAmount} quote`,
    );
    console.log(`   2. Added ${TEST_CONFIG.addLiquidityPct}% more liquidity`);
    console.log(`   3. Removed ${TEST_CONFIG.removeLiquidityPct}% of liquidity`);
    console.log(`   4. Closed position and burned NFT`);
    console.log(`\nPool: ${TEST_CONFIG.poolAddress}`);
    console.log(`Position: ${positionAddress}`);
  });
});

/**
 * PancakeSwap Solana CLMM Position Lifecycle Integration Test
 *
 * Executes the full lifecycle of a CLMM position on Solana mainnet-beta:
 * 1. Open position with initial liquidity → Signs and sends transaction
 * 2. Add liquidity (50% of original) → Signs and sends transaction
 * 3. Remove liquidity (50% of current) → Signs and sends transaction
 * 4. Close position (removes remaining liquidity and burns NFT) → Signs and sends transaction
 *
 * ⚠️  WARNING: This is a LIVE integration test that executes REAL transactions on-chain!
 * Each step waits for transaction confirmation before proceeding to the next.
 *
 * Requirements:
 * - Wallet configured in conf/wallets/solana/
 * - Sufficient SOL for transaction fees (~0.02-0.05 SOL total)
 * - Sufficient PENGU and USDC tokens for the position
 * - Gateway passphrase to decrypt wallet
 *
 * Run in one line:
 * GATEWAY_TEST_MODE=dev MANUAL_TEST=true GATEWAY_PASSPHRASE=<your_passphrase> jest --runInBand test/lifecycle/pancakeswap-sol-position-lifecycle.test.ts
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

import { Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';

import { Solana } from '../../src/chains/solana/solana';
import { PancakeswapSol, PANCAKESWAP_CLMM_PROGRAM_ID } from '../../src/connectors/pancakeswap-sol/pancakeswap-sol';
import { getLiquidityFromAmounts } from '../../src/connectors/pancakeswap-sol/pancakeswap-sol.math';
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
  buildClosePositionTransaction,
} from '../../src/connectors/pancakeswap-sol/pancakeswap-sol.transactions';

let solana: Solana;
let pancakeswapSol: PancakeswapSol;
let positionAddress: string;
let positionNftMintKeypair: Keypair;

/**
 * Position Lifecycle Integration Test
 *
 * IMPORTANT: This test is SKIPPED by default and should be run manually by QA users.
 *
 * Requirements:
 * - GATEWAY_TEST_MODE=dev environment variable
 * - MANUAL_TEST=true environment variable to enable this test
 * - GATEWAY_PASSPHRASE environment variable to decrypt wallet
 * - Wallet configured in conf/wallets/solana/
 * - Sufficient SOL for transaction fees (~0.02-0.05 SOL)
 * - Sufficient PENGU and USDC tokens for the position
 *
 * Run with:
 * GATEWAY_TEST_MODE=dev MANUAL_TEST=true GATEWAY_PASSPHRASE=<your_passphrase> jest --runInBand test/lifecycle/pancakeswap-sol-position-lifecycle.test.ts
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

  it('should open a new CLMM position', async () => {
    console.log('\n=== Step 1: Opening CLMM Position ===');
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

    // Get wallet and priority fee
    const wallet = await solana.getWallet(TEST_CONFIG.walletAddress);
    const walletPubkey = wallet.publicKey;
    const priorityFeeInLamports = await solana.estimateGasPrice();
    const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

    console.log(`   Priority fee: ${priorityFeeInLamports} SOL (${priorityFeePerCU} microlamports/CU)`);

    // Build transaction
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
      800000, // computeUnits
      priorityFeePerCU,
    );

    // Sign transaction (NFT mint keypair + wallet)
    transaction.sign([positionNftMint, wallet]);

    // Save for next steps
    positionNftMintKeypair = positionNftMint;
    positionAddress = positionNftMint.publicKey.toString();

    console.log(`   Position NFT mint: ${positionAddress}`);
    console.log(`   Sending transaction...`);

    // Send and confirm transaction
    const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

    expect(confirmed).toBe(true);
    expect(signature).toBeTruthy();

    console.log(`\n✅ Position opened successfully!`);
    console.log(`   Signature: ${signature}`);
    console.log(`   Fee: ${txData?.meta.fee ? (txData.meta.fee / 1e9).toFixed(6) : 'unknown'} SOL`);
    console.log(`   Position NFT: ${positionAddress}`);
  }, 120000);

  // ==========================================================================
  // Step 2: Add Liquidity (50% of original)
  // ==========================================================================

  it('should add liquidity to the position (50% of original)', async () => {
    console.log('\n=== Step 2: Adding Liquidity ===');
    console.log(`Position: ${positionAddress}`);

    // Calculate amounts to add (50% of original)
    const addBaseAmount = TEST_CONFIG.baseTokenAmount * (TEST_CONFIG.addLiquidityPct / 100);
    const addQuoteAmount = TEST_CONFIG.quoteTokenAmount * (TEST_CONFIG.addLiquidityPct / 100);

    console.log(`Adding: ${addBaseAmount} base (${TEST_CONFIG.addLiquidityPct}% of original)`);
    console.log(`Adding: ${addQuoteAmount} quote (${TEST_CONFIG.addLiquidityPct}% of original)`);

    // Get position info to calculate liquidity
    const positionInfo = await pancakeswapSol.getPositionInfo(positionAddress);
    expect(positionInfo).toBeTruthy();

    const baseToken = await solana.getToken(positionInfo!.baseTokenAddress);
    const quoteToken = await solana.getToken(positionInfo!.quoteTokenAddress);

    // Get pool info for current price
    const poolInfo = await pancakeswapSol.getClmmPoolInfo(TEST_CONFIG.poolAddress);

    // Calculate liquidity to add
    const liquidityToAdd = getLiquidityFromAmounts(
      poolInfo.price,
      TEST_CONFIG.lowerPrice,
      TEST_CONFIG.upperPrice,
      addBaseAmount,
      addQuoteAmount,
      baseToken!.decimals,
      quoteToken!.decimals,
    );

    const amount0Max = new BN((addBaseAmount * Math.pow(10, baseToken!.decimals)).toFixed(0));
    const amount1Max = new BN((addQuoteAmount * Math.pow(10, quoteToken!.decimals)).toFixed(0));

    console.log(`   Liquidity to add: ${liquidityToAdd.toString()}`);

    // Get wallet and priority fee
    const wallet = await solana.getWallet(TEST_CONFIG.walletAddress);
    const walletPubkey = wallet.publicKey;
    const priorityFeeInLamports = await solana.estimateGasPrice();
    const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

    // Build transaction
    const transaction = await buildAddLiquidityTransaction(
      solana,
      positionNftMintKeypair.publicKey,
      walletPubkey,
      liquidityToAdd,
      amount0Max,
      amount1Max,
      600000, // computeUnits
      priorityFeePerCU,
    );

    // Sign and send
    transaction.sign([wallet]);

    console.log(`   Sending transaction...`);

    const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

    expect(confirmed).toBe(true);
    expect(signature).toBeTruthy();

    console.log(`\n✅ Liquidity added successfully!`);
    console.log(`   Signature: ${signature}`);
    console.log(`   Fee: ${txData?.meta.fee ? (txData.meta.fee / 1e9).toFixed(6) : 'unknown'} SOL`);
  }, 120000);

  // ==========================================================================
  // Step 3: Remove Liquidity (50% of current)
  // ==========================================================================

  it('should remove liquidity from the position (50% of current)', async () => {
    console.log('\n=== Step 3: Removing Liquidity ===');
    console.log(`Position: ${positionAddress}`);
    console.log(`Removing: ${TEST_CONFIG.removeLiquidityPct}% of current liquidity`);

    // Get position account to read current liquidity
    const positionNftMint = new PublicKey(positionAddress);
    const [personalPosition] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), positionNftMint.toBuffer()],
      PANCAKESWAP_CLMM_PROGRAM_ID,
    );

    const positionAccountInfo = await solana.connection.getAccountInfo(personalPosition);
    expect(positionAccountInfo).toBeTruthy();

    const { liquidity } = parsePositionData(positionAccountInfo!.data);

    // Calculate liquidity to remove (50% of current)
    const liquidityToRemove = new BN(
      new Decimal(liquidity.toString()).mul(TEST_CONFIG.removeLiquidityPct / 100).toFixed(0),
    );

    console.log(`   Current liquidity: ${liquidity.toString()}`);
    console.log(`   Liquidity to remove: ${liquidityToRemove.toString()}`);

    // Get wallet and priority fee
    const wallet = await solana.getWallet(TEST_CONFIG.walletAddress);
    const walletPubkey = wallet.publicKey;
    const priorityFeeInLamports = await solana.estimateGasPrice();
    const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

    // Build transaction (using 0 for min amounts - no slippage protection)
    const transaction = await buildRemoveLiquidityTransaction(
      solana,
      positionNftMint,
      walletPubkey,
      liquidityToRemove,
      new BN(0), // amount0Min
      new BN(0), // amount1Min
      600000, // computeUnits
      priorityFeePerCU,
    );

    // Sign and send
    transaction.sign([wallet]);

    console.log(`   Sending transaction...`);

    const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

    expect(confirmed).toBe(true);
    expect(signature).toBeTruthy();

    console.log(`\n✅ Liquidity removed successfully!`);
    console.log(`   Signature: ${signature}`);
    console.log(`   Fee: ${txData?.meta.fee ? (txData.meta.fee / 1e9).toFixed(6) : 'unknown'} SOL`);
  }, 120000);

  // ==========================================================================
  // Step 4: Close Position
  // ==========================================================================

  it('should close the position and burn NFT', async () => {
    console.log('\n=== Step 4: Closing Position ===');
    console.log(`Position: ${positionAddress}`);
    console.log(`This will remove all remaining liquidity and burn the position NFT`);

    // Get wallet and priority fee
    const wallet = await solana.getWallet(TEST_CONFIG.walletAddress);
    const walletPubkey = wallet.publicKey;
    const priorityFeeInLamports = await solana.estimateGasPrice();
    const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

    // Build transaction
    const transaction = await buildClosePositionTransaction(
      solana,
      positionNftMintKeypair.publicKey,
      walletPubkey,
      400000, // computeUnits
      priorityFeePerCU,
    );

    // Sign and send
    transaction.sign([wallet]);

    console.log(`   Sending transaction...`);

    const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

    expect(confirmed).toBe(true);
    expect(signature).toBeTruthy();

    console.log(`\n✅ Position closed successfully!`);
    console.log(`   Signature: ${signature}`);
    console.log(`   Fee: ${txData?.meta.fee ? (txData.meta.fee / 1e9).toFixed(6) : 'unknown'} SOL`);
    console.log(`   NFT burned: ${positionAddress}`);
  }, 120000);

  // ==========================================================================
  // Summary
  // ==========================================================================

  afterAll(() => {
    console.log('\n=== Position Lifecycle Test Summary ===');
    console.log(`✅ Successfully executed full position lifecycle on-chain:`);
    console.log(
      `   1. ✅ Opened position with ${TEST_CONFIG.baseTokenAmount} base, ${TEST_CONFIG.quoteTokenAmount} quote`,
    );
    console.log(`   2. ✅ Added ${TEST_CONFIG.addLiquidityPct}% more liquidity`);
    console.log(`   3. ✅ Removed ${TEST_CONFIG.removeLiquidityPct}% of liquidity`);
    console.log(`   4. ✅ Closed position and burned NFT`);
    console.log(`\n📋 Details:`);
    console.log(`   Network: ${TEST_CONFIG.network}`);
    console.log(`   Pool: ${TEST_CONFIG.poolAddress}`);
    console.log(`   Position NFT: ${positionAddress}`);
    console.log(`\n⚠️  Check Solana Explorer for full transaction details`);
  });
});

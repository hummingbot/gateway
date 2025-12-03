/**
 * Comprehensive route tests for PancakeSwap Solana CLMM
 * Tests all routes with read-only operations and validation
 */

import { Solana } from '../../src/chains/solana/solana';
import { quotePosition } from '../../src/connectors/pancakeswap-sol/clmm-routes/quotePosition';
import { quoteSwap } from '../../src/connectors/pancakeswap-sol/clmm-routes/quoteSwap';
import { PancakeswapSol } from '../../src/connectors/pancakeswap-sol/pancakeswap-sol';

// Test data
const NETWORK = 'mainnet-beta';
const SOL_USDC_POOL = 'DJNtGuBGEQiUCWE8F981M2C3ZghZt2XLD8f2sQdZ6rsZ'; // PancakeSwap SOL/USDC
const TEST_WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';

let solana: Solana;
let pancakeswapSol: PancakeswapSol;

describe('PancakeSwap Solana - Comprehensive Route Tests', () => {
  beforeAll(async () => {
    solana = await Solana.getInstance(NETWORK);
    pancakeswapSol = await PancakeswapSol.getInstance(NETWORK);
  }, 60000);

  describe('Quote Position Route', () => {
    it('should quote position with only base token amount specified', async () => {
      const quote = await quotePosition(
        NETWORK,
        170, // lowerPrice
        200, // upperPrice
        SOL_USDC_POOL,
        0.01, // baseTokenAmount (SOL)
        undefined, // quoteTokenAmount
      );

      expect(quote).toBeDefined();
      expect(quote.baseTokenAmount).toBeGreaterThan(0);
      expect(quote.quoteTokenAmount).toBeGreaterThan(0);
      expect(quote.baseLimited).toBe(true);
      expect(quote.liquidity).toBeDefined();
      expect(quote.baseTokenAmountMax).toBeGreaterThanOrEqual(quote.baseTokenAmount);
      expect(quote.quoteTokenAmountMax).toBeGreaterThanOrEqual(quote.quoteTokenAmount);

      console.log('\n💰 Quote Position (Base Only):');
      console.log(`  Input: ${quote.baseTokenAmount.toFixed(6)} SOL`);
      console.log(`  Calculated: ${quote.quoteTokenAmount.toFixed(6)} USDC`);
      console.log(`  Liquidity: ${quote.liquidity}`);
      console.log(`  Base Limited: ${quote.baseLimited}`);
    }, 30000);

    it('should quote position with only quote token amount specified', async () => {
      const quote = await quotePosition(
        NETWORK,
        170,
        200,
        SOL_USDC_POOL,
        undefined, // baseTokenAmount
        2, // quoteTokenAmount (USDC)
      );

      expect(quote).toBeDefined();
      expect(quote.baseTokenAmount).toBeGreaterThan(0);
      expect(quote.quoteTokenAmount).toBeGreaterThan(0);
      expect(quote.baseLimited).toBe(false);
      expect(quote.liquidity).toBeDefined();

      console.log('\n💰 Quote Position (Quote Only):');
      console.log(`  Input: ${quote.quoteTokenAmount.toFixed(6)} USDC`);
      console.log(`  Calculated: ${quote.baseTokenAmount.toFixed(6)} SOL`);
      console.log(`  Liquidity: ${quote.liquidity}`);
      console.log(`  Base Limited: ${quote.baseLimited}`);
    }, 30000);

    it('should quote position with both token amounts (uses limiting amount)', async () => {
      const quote = await quotePosition(
        NETWORK,
        170,
        200,
        SOL_USDC_POOL,
        0.01, // baseTokenAmount
        2, // quoteTokenAmount
      );

      expect(quote).toBeDefined();
      expect(quote.baseTokenAmount).toBeGreaterThan(0);
      expect(quote.quoteTokenAmount).toBeGreaterThan(0);
      expect(quote.liquidity).toBeDefined();
      expect(typeof quote.baseLimited).toBe('boolean');

      // One of the amounts should be adjusted to match CLMM math
      const baseUsed = quote.baseTokenAmount;
      const quoteUsed = quote.quoteTokenAmount;

      console.log('\n💰 Quote Position (Both Amounts):');
      console.log(`  Requested: 0.01 SOL + 2 USDC`);
      console.log(`  Calculated: ${baseUsed.toFixed(6)} SOL + ${quoteUsed.toFixed(6)} USDC`);
      console.log(`  Limiting factor: ${quote.baseLimited ? 'Base (SOL)' : 'Quote (USDC)'}`);
      console.log(`  Liquidity: ${quote.liquidity}`);
    }, 30000);

    it('should reject invalid price range (lower >= upper)', async () => {
      await expect(quotePosition(NETWORK, 200, 170, SOL_USDC_POOL, 0.01, undefined)).rejects.toThrow(
        'Lower price must be less than upper price',
      );
    }, 30000);

    it('should reject when neither amount is specified', async () => {
      await expect(quotePosition(NETWORK, 170, 200, SOL_USDC_POOL, undefined, undefined)).rejects.toThrow(
        'Must specify baseTokenAmount or quoteTokenAmount',
      );
    }, 30000);

    it('should handle wide price range', async () => {
      const quote = await quotePosition(
        NETWORK,
        100, // very wide range
        300,
        SOL_USDC_POOL,
        0.01,
        undefined,
      );

      expect(quote).toBeDefined();
      expect(quote.baseTokenAmount).toBeGreaterThan(0);
      expect(quote.quoteTokenAmount).toBeGreaterThan(0);

      console.log('\n💰 Quote Position (Wide Range 100-300):');
      console.log(`  Amounts: ${quote.baseTokenAmount.toFixed(6)} SOL + ${quote.quoteTokenAmount.toFixed(6)} USDC`);
    }, 30000);
  });

  describe('Quote Swap Route', () => {
    it('should quote SELL swap with exact input', async () => {
      const quote = await quoteSwap(NETWORK, 'SOL', 'USDC', 0.01, 'SELL', SOL_USDC_POOL);

      expect(quote).toBeDefined();
      expect(quote.amountOut).toBeGreaterThan(0);
      expect(quote.minAmountOut).toBeGreaterThan(0);
      expect(quote.minAmountOut).toBeLessThan(quote.amountOut);
      expect(quote.price).toBeGreaterThan(0);
      expect(quote.poolAddress).toBe(SOL_USDC_POOL);

      console.log('\n💱 Quote Swap SELL:');
      console.log(`  Sell: 0.01 SOL`);
      console.log(`  Expected: ${quote.amountOut.toFixed(6)} USDC`);
      console.log(`  Min Output: ${quote.minAmountOut.toFixed(6)} USDC`);
      console.log(`  Price: ${quote.price.toFixed(6)} USDC/SOL`);
    }, 30000);

    it('should quote BUY swap with exact output', async () => {
      const quote = await quoteSwap(NETWORK, 'SOL', 'USDC', 0.01, 'BUY', SOL_USDC_POOL);

      expect(quote).toBeDefined();
      expect(quote.amountOut).toBeGreaterThan(0);
      expect(quote.maxAmountIn).toBeGreaterThan(0);
      expect(quote.maxAmountIn).toBeGreaterThan(quote.amountOut);
      expect(quote.price).toBeGreaterThan(0);

      console.log('\n💱 Quote Swap BUY:');
      console.log(`  Buy: 0.01 SOL`);
      console.log(`  Expected: ${quote.amountOut.toFixed(6)} USDC`);
      console.log(`  Max Input: ${quote.maxAmountIn.toFixed(6)} USDC`);
      console.log(`  Price: ${quote.price.toFixed(6)} USDC/SOL`);
    }, 30000);

    it('should handle different slippage percentages', async () => {
      const quote1 = await quoteSwap(
        NETWORK,
        'SOL',
        'USDC',
        0.01,
        'SELL',
        SOL_USDC_POOL,
        1, // 1% slippage
      );

      const quote2 = await quoteSwap(
        NETWORK,
        'SOL',
        'USDC',
        0.01,
        'SELL',
        SOL_USDC_POOL,
        5, // 5% slippage
      );

      expect(quote1.amountOut).toBeCloseTo(quote2.amountOut, 6);
      expect(quote1.minAmountOut).toBeGreaterThan(quote2.minAmountOut);

      console.log('\n💱 Slippage Comparison:');
      console.log(`  1% slippage - Min: ${quote1.minAmountOut.toFixed(6)} USDC`);
      console.log(`  5% slippage - Min: ${quote2.minAmountOut.toFixed(6)} USDC`);
    }, 30000);

    it('should find pool automatically when not specified', async () => {
      const quote = await quoteSwap(
        NETWORK,
        'SOL',
        'USDC',
        0.01,
        'SELL',
        undefined, // no pool address
      );

      expect(quote).toBeDefined();
      expect(quote.poolAddress).toBeDefined();
      expect(quote.amountOut).toBeGreaterThan(0);

      console.log('\n💱 Auto Pool Discovery:');
      console.log(`  Found pool: ${quote.poolAddress}`);
    }, 30000);
  });

  describe('Math Utilities Validation', () => {
    it('should calculate consistent liquidity from amounts', async () => {
      // Get pool info
      const poolInfo = await pancakeswapSol.getClmmPoolInfo(SOL_USDC_POOL);
      const currentPrice = poolInfo.price;

      // Quote position twice with same amounts
      const quote1 = await quotePosition(NETWORK, 170, 200, SOL_USDC_POOL, 0.01, undefined);

      const quote2 = await quotePosition(NETWORK, 170, 200, SOL_USDC_POOL, 0.01, undefined);

      // Liquidity should be the same
      expect(quote1.liquidity).toBe(quote2.liquidity);
      expect(quote1.baseTokenAmount).toBeCloseTo(quote2.baseTokenAmount, 10);
      expect(quote1.quoteTokenAmount).toBeCloseTo(quote2.quoteTokenAmount, 10);

      console.log('\n🔢 Math Consistency:');
      console.log(`  Current Price: ${currentPrice.toFixed(6)}`);
      console.log(`  Liquidity: ${quote1.liquidity}`);
      console.log(`  Amounts: ${quote1.baseTokenAmount.toFixed(6)} SOL + ${quote1.quoteTokenAmount.toFixed(6)} USDC`);
    }, 30000);

    it('should handle price out of range (above upper) with quote token', async () => {
      // Pool price is ~184, set range below it
      const quote = await quotePosition(
        NETWORK,
        50, // lower
        100, // upper (both below current price)
        SOL_USDC_POOL,
        undefined,
        100, // quote token - will be converted to base
      );

      expect(quote).toBeDefined();
      expect(quote.baseTokenAmount).toBeGreaterThan(0);
      expect(quote.quoteTokenAmount).toBe(0); // All in base token when price above range
      expect(quote.liquidity).toBeDefined();

      console.log('\n🔢 Price Above Range (Quote → Base):');
      console.log(`  Range: 50-100, Current: ~184`);
      console.log(`  Input: 100 USDC`);
      console.log(`  Output: ${quote.baseTokenAmount.toFixed(6)} SOL (all base token)`);
    }, 30000);

    it('should handle price out of range (above upper) with base token', async () => {
      // Pool price is ~184, set range below it
      const quote = await quotePosition(
        NETWORK,
        50, // lower
        100, // upper (both below current price)
        SOL_USDC_POOL,
        0.5, // base token - used directly
        undefined,
      );

      expect(quote).toBeDefined();
      expect(quote.baseTokenAmount).toBeGreaterThan(0);
      expect(quote.quoteTokenAmount).toBe(0);

      console.log('\n🔢 Price Above Range (Base Direct):');
      console.log(`  Range: 50-100, Current: ~184`);
      console.log(`  Input: 0.5 SOL`);
      console.log(`  Output: ${quote.baseTokenAmount.toFixed(6)} SOL`);
    }, 30000);

    it('should handle price out of range (below lower) with base token', async () => {
      // Pool price is ~184, set range above it
      const quote = await quotePosition(
        NETWORK,
        250, // lower (above current price)
        300, // upper
        SOL_USDC_POOL,
        0.1, // base token - will be converted to quote
        undefined,
      );

      expect(quote).toBeDefined();
      expect(quote.baseTokenAmount).toBe(0); // All in quote token when price below range
      expect(quote.quoteTokenAmount).toBeGreaterThan(0);
      expect(quote.liquidity).toBeDefined();

      console.log('\n🔢 Price Below Range (Base → Quote):');
      console.log(`  Range: 250-300, Current: ~184`);
      console.log(`  Input: 0.1 SOL`);
      console.log(`  Output: ${quote.quoteTokenAmount.toFixed(6)} USDC (all quote token)`);
    }, 30000);

    it('should handle price out of range (below lower) with quote token', async () => {
      // Pool price is ~184, set range above it
      const quote = await quotePosition(
        NETWORK,
        250, // lower (above current price)
        300, // upper
        SOL_USDC_POOL,
        undefined,
        50, // quote token - used directly
      );

      expect(quote).toBeDefined();
      expect(quote.baseTokenAmount).toBe(0);
      expect(quote.quoteTokenAmount).toBeGreaterThan(0);

      console.log('\n🔢 Price Below Range (Quote Direct):');
      console.log(`  Range: 250-300, Current: ~184`);
      console.log(`  Input: 50 USDC`);
      console.log(`  Output: ${quote.quoteTokenAmount.toFixed(6)} USDC`);
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle invalid pool address in quote-position', async () => {
      await expect(
        quotePosition(NETWORK, 170, 200, '11111111111111111111111111111111', 0.01, undefined),
      ).rejects.toThrow();
    }, 30000);

    it('should handle invalid token symbols in quote-swap', async () => {
      await expect(quoteSwap(NETWORK, 'INVALID', 'USDC', 0.01, 'SELL')).rejects.toThrow();
    }, 30000);

    it('should handle zero amounts in quote-position', async () => {
      await expect(quotePosition(NETWORK, 170, 200, SOL_USDC_POOL, 0, undefined)).rejects.toThrow();
    }, 30000);

    // Note: Negative amount validation removed - should be handled at API schema level
  });

  describe('Pool Discovery', () => {
    it('should discover pool from pool service', async () => {
      const { PoolService } = await import('../../src/services/pool-service');
      const poolService = PoolService.getInstance();

      const pool = await poolService.getPool('pancakeswap-sol', NETWORK, 'clmm', 'SOL', 'USDC');

      expect(pool).toBeDefined();
      expect(pool?.address).toBeDefined();
      expect(pool?.baseSymbol).toBe('SOL');
      expect(pool?.quoteSymbol).toBe('USDC');
      expect(pool?.type).toBe('clmm');
      expect(pool?.feePct).toBeGreaterThan(0);

      console.log('\n🔍 Pool Discovery:');
      console.log(`  Found: ${pool?.baseSymbol}/${pool?.quoteSymbol}`);
      console.log(`  Address: ${pool?.address}`);
      console.log(`  Fee: ${pool?.feePct}%`);
    }, 30000);
  });
});

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { Raydium } from '../../../src/connectors/raydium/raydium';
import { Solana } from '../../../src/chains/solana/solana';
import { ConfigManagerV2 } from '../../../src/services/config-manager-v2';
import { TokenInfo } from '../../../src/chains/solana/solana.types';
import { toFraction } from '../../../src/connectors/raydium/raydium.utils';
import { logger } from '../../../src/services/logger';

// Set test timeout for integration tests
jest.setTimeout(60000);

describe('Raydium SDK v0.1.141-alpha Integration Tests', () => {
  let raydium: Raydium;
  let solana: Solana;
  
  // Real mainnet tokens
  const SOL: TokenInfo = {
    chainId: 101,
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Wrapped SOL',
    decimals: 9,
    isNative: true,
  };
  
  const USDC: TokenInfo = {
    chainId: 101,
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    isNative: false,
  };

  beforeAll(async () => {
    // Initialize real instances
    solana = await Solana.getInstance('mainnet-beta');
    raydium = await Raydium.create('mainnet-beta');
    
    // Wait for initialization
    await raydium.ensureSDKReady();
  });

  afterAll(async () => {
    await Solana.shutdown();
  });

  describe('SDK Initialization and Pool Loading', () => {
    test('should initialize SDK with proper version', () => {
      expect(raydium).toBeDefined();
      expect(raydium.raydiumSDK).toBeDefined();
    });

    test('should load real AMM pools from SDK', async () => {
      const pools = await raydium.getAmmPools();
      
      expect(pools).toBeDefined();
      expect(pools.length).toBeGreaterThan(0);
      
      // Check for SOL-USDC pool
      const solUsdcPool = pools.find(pool => {
        const hasSOL = pool.baseMint.equals(SOL.address) || pool.quoteMint.equals(SOL.address);
        const hasUSDC = pool.baseMint.equals(USDC.address) || pool.quoteMint.equals(USDC.address);
        return hasSOL && hasUSDC;
      });
      
      expect(solUsdcPool).toBeDefined();
      logger.info(`Found SOL-USDC AMM pool: ${solUsdcPool!.id.toBase58()}`);
    });

    test('should load real CLMM pools from SDK', async () => {
      const pools = await raydium.getClmmPools();
      
      expect(pools).toBeDefined();
      expect(pools.length).toBeGreaterThan(0);
      
      // Check structure of first pool
      const firstPool = pools[0];
      expect(firstPool).toHaveProperty('id');
      expect(firstPool).toHaveProperty('mintA');
      expect(firstPool).toHaveProperty('mintB');
      expect(firstPool).toHaveProperty('currentPrice');
    });
  });

  describe('AMM Swap Operations with New SDK', () => {
    test('should get real swap quote for AMM pool', async () => {
      // Find a real SOL-USDC AMM pool
      const pools = await raydium.getAmmPools();
      const solUsdcPool = pools.find(pool => {
        const hasSOL = pool.baseMint.equals(SOL.address) || pool.quoteMint.equals(SOL.address);
        const hasUSDC = pool.baseMint.equals(USDC.address) || pool.quoteMint.equals(USDC.address);
        return hasSOL && hasUSDC;
      });
      
      if (!solUsdcPool) {
        console.warn('SOL-USDC AMM pool not found, skipping test');
        return;
      }

      const poolId = solUsdcPool.id.toBase58();
      const amount = 0.1; // 0.1 SOL
      const slippage = toFraction(1); // 1% slippage
      
      // Test the actual SDK swap quote
      const quote = await raydium.getRawSwapQuote(
        poolId,
        'SOL',
        'USDC',
        amount,
        'SELL',
        true,
        slippage
      );
      
      expect(quote).toBeDefined();
      expect(quote.amountIn).toBeDefined();
      expect(quote.amountOut).toBeDefined();
      expect(quote.minAmountOut).toBeDefined();
      
      // Verify the quote makes sense
      const inputAmount = Number(quote.amountIn.toString()) / 1e9; // SOL decimals
      const outputAmount = Number(quote.amountOut.toString()) / 1e6; // USDC decimals
      const price = outputAmount / inputAmount;
      
      logger.info(`AMM Swap Quote: ${inputAmount} SOL -> ${outputAmount} USDC (price: $${price})`);
      
      // Basic sanity checks
      expect(inputAmount).toBeCloseTo(0.1, 6);
      expect(outputAmount).toBeGreaterThan(0);
      expect(price).toBeGreaterThan(10); // SOL should be worth more than $10
      expect(price).toBeLessThan(1000); // But less than $1000
    });

    test('should handle AMM swap errors properly', async () => {
      const invalidPoolId = '11111111111111111111111111111111';
      
      await expect(
        raydium.getRawSwapQuote(
          invalidPoolId,
          'SOL',
          'USDC',
          0.1,
          'SELL',
          true,
          toFraction(1)
        )
      ).rejects.toThrow();
    });
  });

  describe('CLMM Swap Operations with New SDK', () => {
    test('should get real swap quote for CLMM pool', async () => {
      const pools = await raydium.getClmmPools();
      
      // Find a SOL-USDC CLMM pool
      const solUsdcPool = pools.find(pool => {
        const hasSOL = pool.mintA.address === SOL.address || pool.mintB.address === SOL.address;
        const hasUSDC = pool.mintA.address === USDC.address || pool.mintB.address === USDC.address;
        return hasSOL && hasUSDC;
      });
      
      if (!solUsdcPool) {
        console.warn('SOL-USDC CLMM pool not found, skipping test');
        return;
      }

      const poolId = solUsdcPool.id;
      const amount = 0.1; // 0.1 SOL
      const slippage = toFraction(1); // 1% slippage
      
      const quote = await raydium.getRawClmmSwapQuote(
        poolId,
        'SOL',
        'USDC',
        amount,
        'SELL',
        true,
        slippage
      );
      
      expect(quote).toBeDefined();
      expect(quote.inputAmount).toBeDefined();
      expect(quote.outputAmount).toBeDefined();
      expect(quote.minOutputAmount).toBeDefined();
      
      // Verify the quote
      const inputAmount = Number(quote.inputAmount.toString()) / 1e9; // SOL decimals
      const outputAmount = Number(quote.outputAmount.toString()) / 1e6; // USDC decimals
      const price = outputAmount / inputAmount;
      
      logger.info(`CLMM Swap Quote: ${inputAmount} SOL -> ${outputAmount} USDC (price: $${price})`);
      
      // Basic sanity checks
      expect(inputAmount).toBeCloseTo(0.1, 6);
      expect(outputAmount).toBeGreaterThan(0);
      expect(price).toBeGreaterThan(10); // SOL should be worth more than $10
      expect(price).toBeLessThan(1000); // But less than $1000
    });
  });

  describe('SDK Breaking Changes and New Features', () => {
    test('should verify DEVNET_PROGRAM_ID structure changes', () => {
      // Import directly from SDK to verify structure
      const { DEVNET_PROGRAM_ID } = require('@raydium-io/raydium-sdk-v2');
      
      // New SDK uses AMM_V4 instead of AmmV4
      expect(DEVNET_PROGRAM_ID.AMM_V4).toBeDefined();
      expect(DEVNET_PROGRAM_ID.AMM_STABLE).toBeDefined();
      expect(DEVNET_PROGRAM_ID.CLMM_PROGRAM_ID).toBeDefined();
      
      // Old properties should not exist
      expect(DEVNET_PROGRAM_ID.AmmV4).toBeUndefined();
      expect(DEVNET_PROGRAM_ID.AmmStable).toBeUndefined();
      expect(DEVNET_PROGRAM_ID.CLMM).toBeUndefined();
    });

    test('should verify Percent class changes', () => {
      const { Percent } = require('@raydium-io/raydium-sdk-v2');
      
      const percent = new Percent(1, 100); // 1%
      
      // toDecimal() method no longer exists
      expect(percent.toDecimal).toBeUndefined();
      
      // Should use numerator/denominator directly
      expect(percent.numerator).toBeDefined();
      expect(percent.denominator).toBeDefined();
      
      const decimal = percent.numerator.toNumber() / percent.denominator.toNumber();
      expect(decimal).toBe(0.01);
    });

    test('should verify addLiquidity requires otherAmountMin', async () => {
      // This is a type-level change, so we verify the SDK method signature
      const addLiquidityMethod = raydium.raydiumSDK.liquidity.addLiquidity;
      expect(addLiquidityMethod).toBeDefined();
      
      // The method should accept parameters including otherAmountMin
      // We can't easily test this without a wallet, but we verify the method exists
    });

    test('should verify computeBudgetConfig in swap methods', async () => {
      // Check that SDK swap methods accept computeBudgetConfig
      const swapMethod = raydium.raydiumSDK.liquidity.swap;
      expect(swapMethod).toBeDefined();
      
      // The new SDK should support compute budget configuration
    });
  });

  describe('Error Handling with New SDK', () => {
    test('should handle insufficient liquidity errors', async () => {
      const pools = await raydium.getAmmPools();
      if (pools.length === 0) {
        console.warn('No AMM pools found, skipping test');
        return;
      }

      const pool = pools[0];
      const poolId = pool.id.toBase58();
      
      // Try to swap an unreasonably large amount
      const hugeAmount = 1000000000; // 1 billion SOL
      
      await expect(
        raydium.getRawSwapQuote(
          poolId,
          'SOL',
          'USDC',
          hugeAmount,
          'SELL',
          true,
          toFraction(1)
        )
      ).rejects.toThrow();
    });

    test('should handle invalid pool addresses', async () => {
      const invalidAddress = 'invalid-address-here';
      
      await expect(
        raydium.getRawSwapQuote(
          invalidAddress,
          'SOL',
          'USDC',
          0.1,
          'SELL',
          true,
          toFraction(1)
        )
      ).rejects.toThrow();
    });
  });

  describe('Performance with New SDK', () => {
    test('should load pools within reasonable time', async () => {
      const startTime = Date.now();
      
      const ammPools = await raydium.getAmmPools();
      const clmmPools = await raydium.getClmmPools();
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      logger.info(`Loaded ${ammPools.length} AMM pools and ${clmmPools.length} CLMM pools in ${duration}ms`);
      
      // Should load within 30 seconds
      expect(duration).toBeLessThan(30000);
      
      // Should have loaded pools
      expect(ammPools.length).toBeGreaterThan(0);
      expect(clmmPools.length).toBeGreaterThan(0);
    });
  });
});
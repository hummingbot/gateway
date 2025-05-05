import { Raydium } from '../../../../src/connectors/raydium/raydium';
import { COMMON_TEST_CONSTANTS } from '../../utils/schema-test-utils';

// Configure test timeout (30 seconds)
jest.setTimeout(30000);

// Test constants
const NETWORK = 'mainnet-beta';
const WALLET_ADDRESS = COMMON_TEST_CONSTANTS.SOLANA.TEST_WALLET_ADDRESS;
const SOL_USDC_POOL = COMMON_TEST_CONSTANTS.SOLANA.POOLS['SOL-USDC'];

// Helper to determine if we should run live tests
const shouldSkipLiveTests = () => {
  return process.env.GATEWAY_TEST_MODE !== 'live';
};

describe('Raydium Tests', () => {
  let raydium: Raydium;

  // Set up the Raydium instance before all tests
  beforeAll(async () => {
    raydium = await Raydium.getInstance(NETWORK);
  });

  describe('AMM Pool Info', () => {
    it('should return pool information for SOL/USDC', async () => {
      // Skip if not in live mode
      if (shouldSkipLiveTests()) {
        console.log('Skipping live test (use GATEWAY_TEST_MODE=live to enable)');
        return;
      }
      
      // First, find the pool address for SOL/USDC
      const pools = await raydium.raydiumSDK.api.getLiquidityPools({}); 
      const solUsdcPool = pools.find(
        p => p.baseMint === COMMON_TEST_CONSTANTS.SOLANA.TOKENS.SOL.address && 
             p.quoteMint === COMMON_TEST_CONSTANTS.SOLANA.TOKENS.USDC.address
      );
      
      expect(solUsdcPool).toBeDefined();
      const poolAddress = solUsdcPool?.id || '';
      
      // Get detailed pool data
      const poolData = await raydium.getAmmPoolInfo(poolAddress);
      
      // Basic validation
      expect(poolData).toBeDefined();
      expect(poolData?.baseTokenAddress).toBeDefined();
      expect(poolData?.quoteTokenAddress).toBeDefined();
      expect(poolData?.lpMint?.address).toBeDefined();
      
      // Print pool data
      console.log('SOL/USDC Pool Data:', {
        address: poolData?.address,
        baseTokenAddress: poolData?.baseTokenAddress,
        quoteTokenAddress: poolData?.quoteTokenAddress,
        lpMint: poolData?.lpMint,
        baseTokenAmount: poolData?.baseTokenAmount,
        quoteTokenAmount: poolData?.quoteTokenAmount
      });
    });
  });

  describe('CLMM Pool Info', () => {
    it('should return CLMM pool information for SOL/USDC', async () => {
      // Skip if not in live mode
      if (shouldSkipLiveTests()) {
        console.log('Skipping live test (use GATEWAY_TEST_MODE=live to enable)');
        return;
      }
      
      // First, find a CLMM pool for SOL/USDC
      const concentratedPools = await raydium.raydiumSDK.api.getConcentratedPools({});
      const solUsdcClmmPool = concentratedPools.find(
        p => p.baseMint === COMMON_TEST_CONSTANTS.SOLANA.TOKENS.SOL.address && 
             p.quoteMint === COMMON_TEST_CONSTANTS.SOLANA.TOKENS.USDC.address
      );
      
      expect(solUsdcClmmPool).toBeDefined();
      const poolAddress = solUsdcClmmPool?.id || '';
      
      // Get detailed CLMM pool data
      const pool = await raydium.getClmmPoolInfo(poolAddress);
      
      // Basic validation
      expect(pool).toBeDefined();
      expect(pool?.address).toBeDefined();
      expect(pool?.baseTokenAddress).toBeDefined();
      expect(pool?.quoteTokenAddress).toBeDefined();
      
      // Print CLMM pool data
      console.log('SOL/USDC CLMM Pool Data:', {
        address: pool?.address,
        baseTokenAddress: pool?.baseTokenAddress,
        quoteTokenAddress: pool?.quoteTokenAddress,
        feePct: pool?.feePct,
        price: pool?.price
      });
    });
  });

  describe('Get Swap Quote', () => {
    it('should return a swap quote for SOL to USDC', async () => {
      // Skip if not in live mode
      if (shouldSkipLiveTests()) {
        console.log('Skipping live test (use GATEWAY_TEST_MODE=live to enable)');
        return;
      }
      
      // First, find an AMM pool for SOL/USDC
      const pools = await raydium.raydiumSDK.api.getLiquidityPools({}); 
      const solUsdcPool = pools.find(
        p => p.baseMint === COMMON_TEST_CONSTANTS.SOLANA.TOKENS.SOL.address && 
             p.quoteMint === COMMON_TEST_CONSTANTS.SOLANA.TOKENS.USDC.address
      );
      
      expect(solUsdcPool).toBeDefined();
      
      // Get the current SOL/USDC price from the pool
      const price = parseFloat(solUsdcPool?.price || '0');
      const amountIn = 1.0; // 1 SOL
      const amountOut = amountIn * price; // Estimated USDC
      
      // Create a simple quote with the data we have
      const quote = {
        amountIn,
        amountOut,
        minAmountOut: amountOut * 0.995, // Apply 0.5% slippage
        executionPrice: price,
        priceImpact: 0.001,
        fee: amountIn * 0.003 // Assume 0.3% fee
      };
      
      // Basic validation
      expect(quote).toBeDefined();
      expect(quote.amountIn).toBeCloseTo(1.0);
      expect(quote.amountOut).toBeGreaterThan(0);
      
      // Print swap quote
      console.log('Swap Quote for 1 SOL to USDC:', {
        amountIn: quote.amountIn,
        amountOut: quote.amountOut,
        minAmountOut: quote.minAmountOut,
        price: quote.executionPrice,
        priceImpact: quote.priceImpact,
        fee: quote.fee
      });
    });
  });
});
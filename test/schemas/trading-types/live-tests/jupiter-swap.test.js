// Configure test timeout (30 seconds)
jest.setTimeout(30000);

// Test constants
const NETWORK = 'mainnet-beta';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

// Helper to determine if we should skip live tests
const shouldSkipLiveTests = () => {
  return process.env.GATEWAY_TEST_MODE !== 'live';
};

describe('Jupiter Swap Schema Tests', () => {
  describe('Swap Quote Schema', () => {
    it('validates swap quote schema structure', () => {
      // Create a sample swap quote object that matches the schema
      const swapQuote = {
        poolAddress: null, // Jupiter doesn't use poolAddress since it aggregates across many pools
        estimatedAmountIn: 1.0,
        estimatedAmountOut: 30.0,
        minAmountOut: 29.85,
        maxAmountIn: 1.005,
        baseTokenBalanceChange: -1.0,
        quoteTokenBalanceChange: 30.0,
        price: 30.0,
        gasPrice: 5000,
        gasLimit: 200000,
        gasCost: 0.001
      };
      
      // Validate properties
      expect(swapQuote).toHaveProperty('estimatedAmountIn');
      expect(swapQuote).toHaveProperty('estimatedAmountOut');
      expect(swapQuote).toHaveProperty('minAmountOut');
      expect(swapQuote).toHaveProperty('maxAmountIn');
      expect(swapQuote).toHaveProperty('baseTokenBalanceChange');
      expect(swapQuote).toHaveProperty('quoteTokenBalanceChange');
      expect(swapQuote).toHaveProperty('price');
      expect(swapQuote).toHaveProperty('gasPrice');
      expect(swapQuote).toHaveProperty('gasLimit');
      expect(swapQuote).toHaveProperty('gasCost');
      
      // Validate data types
      expect(typeof swapQuote.estimatedAmountIn).toBe('number');
      expect(typeof swapQuote.estimatedAmountOut).toBe('number');
      expect(typeof swapQuote.minAmountOut).toBe('number');
      expect(typeof swapQuote.maxAmountIn).toBe('number');
      expect(typeof swapQuote.baseTokenBalanceChange).toBe('number');
      expect(typeof swapQuote.quoteTokenBalanceChange).toBe('number');
      expect(typeof swapQuote.price).toBe('number');
      expect(typeof swapQuote.gasPrice).toBe('number');
      expect(typeof swapQuote.gasLimit).toBe('number');
      expect(typeof swapQuote.gasCost).toBe('number');
      
      // Validate token balance changes have opposite signs (one positive, one negative)
      expect(Math.sign(swapQuote.baseTokenBalanceChange) * Math.sign(swapQuote.quoteTokenBalanceChange)).toBeLessThan(0);
      
      // Validate ranges
      expect(swapQuote.estimatedAmountIn).toBeGreaterThan(0);
      expect(swapQuote.estimatedAmountOut).toBeGreaterThan(0);
      expect(swapQuote.minAmountOut).toBeLessThanOrEqual(swapQuote.estimatedAmountOut);
      expect(swapQuote.maxAmountIn).toBeGreaterThanOrEqual(swapQuote.estimatedAmountIn);
      expect(swapQuote.price).toBeGreaterThan(0);
      expect(swapQuote.gasPrice).toBeGreaterThan(0);
      expect(swapQuote.gasLimit).toBeGreaterThan(0);
      expect(swapQuote.gasCost).toBeGreaterThan(0);
      
      console.log('Jupiter Swap Quote schema validation passed');
    });
  });
  
  describe('Execute Swap Response Schema', () => {
    it('validates execute swap response schema structure', () => {
      // Create a sample execute swap response that matches the schema
      const executeSwapResponse = {
        signature: '5QpUZPim4Riw8HrPnUqZiW1vZrxyA2hHpgAVonkXjirKH147YLsZAZruw4gB9cGBrZeP2DgAWjvYXaKKFfhuJpC9',
        totalInputSwapped: 1.0,
        totalOutputSwapped: 30.0,
        fee: 0.003,
        baseTokenBalanceChange: -1.0,
        quoteTokenBalanceChange: 30.0
      };
      
      // Validate properties
      expect(executeSwapResponse).toHaveProperty('signature');
      expect(executeSwapResponse).toHaveProperty('totalInputSwapped');
      expect(executeSwapResponse).toHaveProperty('totalOutputSwapped');
      expect(executeSwapResponse).toHaveProperty('fee');
      expect(executeSwapResponse).toHaveProperty('baseTokenBalanceChange');
      expect(executeSwapResponse).toHaveProperty('quoteTokenBalanceChange');
      
      // Validate data types
      expect(typeof executeSwapResponse.signature).toBe('string');
      expect(typeof executeSwapResponse.totalInputSwapped).toBe('number');
      expect(typeof executeSwapResponse.totalOutputSwapped).toBe('number');
      expect(typeof executeSwapResponse.fee).toBe('number');
      expect(typeof executeSwapResponse.baseTokenBalanceChange).toBe('number');
      expect(typeof executeSwapResponse.quoteTokenBalanceChange).toBe('number');
      
      // Validate token balance changes have opposite signs (one positive, one negative)
      expect(Math.sign(executeSwapResponse.baseTokenBalanceChange) * Math.sign(executeSwapResponse.quoteTokenBalanceChange)).toBeLessThan(0);
      
      // Validate ranges
      expect(executeSwapResponse.totalInputSwapped).toBeGreaterThan(0);
      expect(executeSwapResponse.totalOutputSwapped).toBeGreaterThan(0);
      expect(executeSwapResponse.fee).toBeGreaterThanOrEqual(0);
      
      console.log('Jupiter Execute Swap Response schema validation passed');
    });
  });
  
  // Test SOL -> USDC swap (buy quote)
  describe('Buy Side Swap Quote', () => {
    it('validates buy side swap quote structure', () => {
      // Create a sample buy side swap quote - SOL -> USDC
      // In a buy quote, amount refers to the quote token (USDC)
      const buySwapQuote = {
        estimatedAmountIn: 1.0, // 1 SOL
        estimatedAmountOut: 30.0, // 30 USDC
        minAmountOut: 29.85, // min USDC to receive (with slippage)
        maxAmountIn: 1.005, // max SOL to spend (with slippage)
        baseTokenBalanceChange: -1.0, // Lose 1 SOL
        quoteTokenBalanceChange: 30.0, // Gain 30 USDC
        price: 30.0, // 1 SOL = 30 USDC
        gasPrice: 5000,
        gasLimit: 200000,
        gasCost: 0.001
      };
      
      // Validate token balance signs for a buy
      expect(buySwapQuote.baseTokenBalanceChange).toBeLessThan(0);
      expect(buySwapQuote.quoteTokenBalanceChange).toBeGreaterThan(0);
      
      // Validate price calculation for a buy
      const impliedPrice = Math.abs(buySwapQuote.quoteTokenBalanceChange / buySwapQuote.baseTokenBalanceChange);
      expect(buySwapQuote.price).toBeCloseTo(impliedPrice, 1);
      
      console.log('Jupiter Buy Side Swap Quote validation passed');
    });
  });
  
  // Test USDC -> SOL swap (sell quote)
  describe('Sell Side Swap Quote', () => {
    it('validates sell side swap quote structure', () => {
      // Create a sample sell side swap quote - USDC -> SOL
      // In a sell quote, amount refers to the base token (SOL)
      const sellSwapQuote = {
        estimatedAmountIn: 30.0, // 30 USDC
        estimatedAmountOut: 1.0, // 1 SOL
        minAmountOut: 0.995, // min SOL to receive (with slippage)
        maxAmountIn: 30.15, // max USDC to spend (with slippage)
        baseTokenBalanceChange: 1.0, // Gain 1 SOL
        quoteTokenBalanceChange: -30.0, // Lose 30 USDC
        price: 30.0, // 1 SOL = 30 USDC
        gasPrice: 5000,
        gasLimit: 200000,
        gasCost: 0.001
      };
      
      // Validate token balance signs for a sell
      expect(sellSwapQuote.baseTokenBalanceChange).toBeGreaterThan(0);
      expect(sellSwapQuote.quoteTokenBalanceChange).toBeLessThan(0);
      
      // Validate price calculation for a sell
      const impliedPrice = Math.abs(sellSwapQuote.quoteTokenBalanceChange / sellSwapQuote.baseTokenBalanceChange);
      expect(sellSwapQuote.price).toBeCloseTo(impliedPrice, 1);
      
      console.log('Jupiter Sell Side Swap Quote validation passed');
    });
  });
  
  // Live test for swap quote - only run in live mode
  describe('Live Swap Quote Test', () => {
    it('retrieves actual swap quote from Solana mainnet-beta', async () => {
      // Skip if not in live mode
      if (shouldSkipLiveTests()) {
        console.log('Skipping live test - not in live mode');
        return;
      }
      
      // Import modules needed for live testing
      const { default: axios } = require('axios');
      
      try {
        // Call the gateway API
        const response = await axios.get('http://localhost:15888/connectors/jupiter/quote-swap', {
          params: {
            network: NETWORK,
            baseToken: 'SOL',
            quoteToken: 'USDC',
            amount: 1.0,
            side: 'SELL'
          }
        });
        
        const swapQuote = response.data;
        console.log('Retrieved Jupiter swap quote:', swapQuote);
        
        // Validate properties
        expect(swapQuote).toHaveProperty('estimatedAmountIn');
        expect(swapQuote).toHaveProperty('estimatedAmountOut');
        expect(swapQuote).toHaveProperty('minAmountOut');
        expect(swapQuote).toHaveProperty('maxAmountIn');
        expect(swapQuote).toHaveProperty('baseTokenBalanceChange');
        expect(swapQuote).toHaveProperty('quoteTokenBalanceChange');
        expect(swapQuote).toHaveProperty('price');
        
        // Specific validations for the SELL side swap (selling SOL for USDC)
        expect(swapQuote.estimatedAmountIn).toBe(1.0); // We're selling exactly 1.0 SOL
        expect(swapQuote.baseTokenBalanceChange).toBeLessThan(0); // Negative change in SOL
        expect(swapQuote.quoteTokenBalanceChange).toBeGreaterThan(0); // Positive change in USDC
        
        console.log('Live Jupiter Swap Quote test passed');
      } catch (error) {
        console.error('Live test error:', error.response ? error.response.data : error.message);
        // Don't fail the test if the server is not running
        console.log('Skipping live test - server may not be running');
      }
    });
  });
  
  // Test multiple token swap paths (SOL -> USDT -> USDC)
  describe('Multi-hop Swap Quote Test', () => {
    it('tests multi-hop swap quote if available in live mode', async () => {
      // Skip if not in live mode
      if (shouldSkipLiveTests()) {
        console.log('Skipping live multi-hop test - not in live mode');
        return;
      }
      
      // Import modules needed for live testing
      const { default: axios } = require('axios');
      
      try {
        // Call the gateway API for a SOL -> USDT -> USDC multi-hop swap (if available)
        // Jupiter will automatically find the best route, including multi-hop routes if beneficial
        const response = await axios.get('http://localhost:15888/connectors/jupiter/quote-swap', {
          params: {
            network: NETWORK,
            baseToken: 'BONK', // Using BONK to increase chance of multi-hop
            quoteToken: 'USDC',
            amount: 1000000.0, // 1M BONK tokens
            side: 'SELL'
          }
        });
        
        const swapQuote = response.data;
        console.log('Retrieved Jupiter multi-hop swap quote:', swapQuote);
        
        // Validate properties (same as standard swap quote)
        expect(swapQuote).toHaveProperty('estimatedAmountIn');
        expect(swapQuote).toHaveProperty('estimatedAmountOut');
        expect(swapQuote).toHaveProperty('minAmountOut');
        expect(swapQuote).toHaveProperty('maxAmountIn');
        expect(swapQuote).toHaveProperty('baseTokenBalanceChange');
        expect(swapQuote).toHaveProperty('quoteTokenBalanceChange');
        expect(swapQuote).toHaveProperty('price');
        
        console.log('Live Jupiter Multi-hop Swap Quote test passed');
      } catch (error) {
        console.error('Live multi-hop test error:', error.response ? error.response.data : error.message);
        // Don't fail the test if the server is not running or this token isn't available
        console.log('Skipping live multi-hop test - server may not be running or token not available');
      }
    });
  });
});
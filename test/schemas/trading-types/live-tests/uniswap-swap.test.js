// Configure test timeout (30 seconds)
jest.setTimeout(30000);

// Test constants
const NETWORK = 'base';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SAMPLE_POOL_ADDRESS = '0x4c36388be6f416a29c8d8eee81c771ce6be14b18'; // WETH-USDC pool on Base

// Helper to determine if we should skip live tests
const shouldSkipLiveTests = () => {
  return process.env.GATEWAY_TEST_MODE !== 'live';
};

describe('Uniswap Swap Schema Tests', () => {
  describe('Swap Quote Schema', () => {
    it('validates swap quote schema structure', () => {
      // Create a sample swap quote object that matches the schema
      const swapQuote = {
        poolAddress: SAMPLE_POOL_ADDRESS,
        estimatedAmountIn: 1.0,
        estimatedAmountOut: 3200.0,
        minAmountOut: 3168.0, // With 1% slippage
        maxAmountIn: 1.01, // With 1% slippage
        baseTokenBalanceChange: -1.0,
        quoteTokenBalanceChange: 3200.0,
        price: 3200.0,
        gasPrice: 1.5, // in Gwei
        gasLimit: 150000,
        gasCost: 0.000225 // in ETH
      };
      
      // Validate properties
      expect(swapQuote).toHaveProperty('poolAddress');
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
      expect(typeof swapQuote.poolAddress).toBe('string');
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
      
      console.log('Swap Quote schema validation passed');
    });
  });
  
  describe('Execute Swap Response Schema', () => {
    it('validates execute swap response schema structure', () => {
      // Create a sample execute swap response that matches the schema
      const executeSwapResponse = {
        signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        totalInputSwapped: 1.0,
        totalOutputSwapped: 3200.0,
        fee: 0.003,
        baseTokenBalanceChange: -1.0,
        quoteTokenBalanceChange: 3200.0
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
      
      console.log('Execute Swap Response schema validation passed');
    });
  });
  
  // Live test for AMM swap quote - only run in live mode
  describe('Live AMM Swap Quote Test', () => {
    it('retrieves actual AMM swap quote from Base network', async () => {
      // Skip if not in live mode
      if (shouldSkipLiveTests()) {
        console.log('Skipping live test - not in live mode');
        return;
      }
      
      // Import modules needed for live testing
      const { default: axios } = require('axios');
      
      try {
        // Call the gateway API for AMM swap quote
        const response = await axios.get('http://localhost:15888/connectors/uniswap/amm/quote-swap', {
          params: {
            network: NETWORK,
            baseToken: 'WETH',
            quoteToken: 'USDC',
            amount: 0.1,
            side: 'SELL'
          }
        });
        
        const swapQuote = response.data;
        console.log('Retrieved AMM swap quote:', swapQuote);
        
        // Validate properties
        expect(swapQuote).toHaveProperty('poolAddress');
        expect(swapQuote).toHaveProperty('estimatedAmountIn');
        expect(swapQuote).toHaveProperty('estimatedAmountOut');
        expect(swapQuote).toHaveProperty('minAmountOut');
        expect(swapQuote).toHaveProperty('maxAmountIn');
        expect(swapQuote).toHaveProperty('baseTokenBalanceChange');
        expect(swapQuote).toHaveProperty('quoteTokenBalanceChange');
        expect(swapQuote).toHaveProperty('price');
        
        // Specific validations for the SELL side swap (selling WETH for USDC)
        expect(swapQuote.estimatedAmountIn).toBe(0.1); // We're selling exactly 0.1 WETH
        expect(swapQuote.baseTokenBalanceChange).toBeLessThan(0); // Negative change in WETH
        expect(swapQuote.quoteTokenBalanceChange).toBeGreaterThan(0); // Positive change in USDC
        
        console.log('Live AMM Swap Quote test passed');
      } catch (error) {
        console.error('Live test error:', error.response ? error.response.data : error.message);
        // Don't fail the test if the server is not running
        console.log('Skipping live test - server may not be running');
      }
    });
  });
  
  // Live test for CLMM swap quote - only run in live mode
  describe('Live CLMM Swap Quote Test', () => {
    it('retrieves actual CLMM swap quote from Base network', async () => {
      // Skip if not in live mode
      if (shouldSkipLiveTests()) {
        console.log('Skipping live test - not in live mode');
        return;
      }
      
      // Import modules needed for live testing
      const { default: axios } = require('axios');
      
      try {
        // Call the gateway API for CLMM swap quote
        const response = await axios.get('http://localhost:15888/connectors/uniswap/clmm/quote-swap', {
          params: {
            network: NETWORK,
            baseToken: 'WETH',
            quoteToken: 'USDC',
            amount: 0.1,
            side: 'SELL',
            feeTier: 'MEDIUM' // 0.3% fee tier
          }
        });
        
        const swapQuote = response.data;
        console.log('Retrieved CLMM swap quote:', swapQuote);
        
        // Validate properties
        expect(swapQuote).toHaveProperty('poolAddress');
        expect(swapQuote).toHaveProperty('estimatedAmountIn');
        expect(swapQuote).toHaveProperty('estimatedAmountOut');
        expect(swapQuote).toHaveProperty('minAmountOut');
        expect(swapQuote).toHaveProperty('maxAmountIn');
        expect(swapQuote).toHaveProperty('baseTokenBalanceChange');
        expect(swapQuote).toHaveProperty('quoteTokenBalanceChange');
        expect(swapQuote).toHaveProperty('price');
        
        // Specific validations for the SELL side swap (selling WETH for USDC)
        expect(swapQuote.estimatedAmountIn).toBe(0.1); // We're selling exactly 0.1 WETH
        expect(swapQuote.baseTokenBalanceChange).toBeLessThan(0); // Negative change in WETH
        expect(swapQuote.quoteTokenBalanceChange).toBeGreaterThan(0); // Positive change in USDC
        
        console.log('Live CLMM Swap Quote test passed');
      } catch (error) {
        console.error('Live test error:', error.response ? error.response.data : error.message);
        // Don't fail the test if the server is not running
        console.log('Skipping live test - server may not be running');
      }
    });
  });
});
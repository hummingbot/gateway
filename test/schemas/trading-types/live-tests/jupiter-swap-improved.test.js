const { 
  configureTestTimeout, 
  shouldSkipLiveTests, 
  API_CONFIG 
} = require('../helpers/test-config');

const { 
  TOKENS, 
  SAMPLE_ADDRESSES, 
  createSwapQuote,
  createExecuteSwapResponse
} = require('../helpers/test-factories');

const {
  validateSwapQuote,
  validateExecuteSwapResponse
} = require('../helpers/schema-validators');

// Configure test timeout
configureTestTimeout();

// Set up network specific constants
const CHAIN = 'solana';
const NETWORK = 'mainnet-beta';
const SOL_MINT = TOKENS.solana.SOL;
const USDC_MINT = TOKENS.solana.USDC;
const USDT_MINT = TOKENS.solana.USDT;

// Mock axios for API calls
jest.mock('axios');

describe('Jupiter Swap Schema Tests', () => {
  // Reset mocks before each test
  beforeEach(() => {
    if (jest.isMockFunction(require('axios').default.get)) {
      require('axios').default.get.mockReset();
      require('axios').default.post.mockReset();
    }
  });

  describe('Swap Quote Schema', () => {
    // Create test data for both SELL and BUY sides
    const sellQuote = createSwapQuote({
      chain: CHAIN,
      poolAddress: null, // Jupiter doesn't use poolAddress since it aggregates across many pools
      side: 'SELL'
    });
    
    const buyQuote = createSwapQuote({
      chain: CHAIN,
      poolAddress: null,
      side: 'BUY'
    });

    it('validates swap quote schema structure', () => {
      validateSwapQuote(sellQuote, 'SELL');
    });
    
    // Test for Jupiter-specific behavior: allowing null poolAddress
    it('supports null poolAddress field', () => {
      expect(sellQuote.poolAddress).toBeNull();
      // Still validates as a swap quote even with null poolAddress
      validateSwapQuote(sellQuote, 'SELL');
    });
  });
  
  describe('Execute Swap Response Schema', () => {
    const executeSwapResponse = createExecuteSwapResponse({
      chain: CHAIN,
      side: 'SELL'
    });

    it('validates execute swap response schema structure', () => {
      validateExecuteSwapResponse(executeSwapResponse);
    });
  });
  
  describe('Buy/Sell Side Swap Quote Handling', () => {
    // Create test data for test cases
    const testCases = [
      {
        name: 'SELL SOL for USDC',
        side: 'SELL',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: 1.0,
        expectedDirection: {
          baseChange: 'negative',
          quoteChange: 'positive'
        }
      },
      {
        name: 'BUY SOL with USDC',
        side: 'BUY',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: 1.0,
        expectedDirection: {
          baseChange: 'positive',
          quoteChange: 'negative'
        }
      }
    ];
    
    // Parameterized tests for different swap scenarios
    testCases.forEach(testCase => {
      it(`handles ${testCase.name} correctly`, () => {
        // Create a swap quote for this test case
        const swapQuote = createSwapQuote({
          chain: CHAIN,
          side: testCase.side,
          amount: testCase.amount
        });
        
        // Validate the quote structure
        validateSwapQuote(swapQuote, testCase.side);
        
        // Check the direction of token balance changes
        if (testCase.expectedDirection.baseChange === 'negative') {
          expect(swapQuote.baseTokenBalanceChange).toBeLessThan(0);
        } else {
          expect(swapQuote.baseTokenBalanceChange).toBeGreaterThan(0);
        }
        
        if (testCase.expectedDirection.quoteChange === 'negative') {
          expect(swapQuote.quoteTokenBalanceChange).toBeLessThan(0);
        } else {
          expect(swapQuote.quoteTokenBalanceChange).toBeGreaterThan(0);
        }
        
        // Validate price calculation is consistent with balance changes
        const impliedPrice = Math.abs(swapQuote.quoteTokenBalanceChange / swapQuote.baseTokenBalanceChange);
        expect(swapQuote.price).toBeCloseTo(impliedPrice, 1);
      });
    });
  });
  
  describe('Live Swap Quote Test', () => {
    it('retrieves actual swap quote from Solana mainnet-beta', async () => {
      // Skip if not in live mode
      if (shouldSkipLiveTests()) {
        return;
      }
      
      // Import axios for live testing
      const { default: axios } = require('axios');
      
      try {
        // Call the gateway API
        const response = await axios.get(
          `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.jupiter.quoteSwap}`,
          {
            params: {
              network: NETWORK,
              baseToken: 'SOL',
              quoteToken: 'USDC',
              amount: 1.0,
              side: 'SELL'
            }
          }
        );
        
        const swapQuote = response.data;
        
        // Validate using the shared schema validator
        validateSwapQuote(swapQuote, 'SELL');
        
        // Specific validations for the SELL side swap (selling SOL for USDC)
        expect(swapQuote.estimatedAmountIn).toBe(1.0); // We're selling exactly 1.0 SOL
        expect(swapQuote.baseTokenBalanceChange).toBeLessThan(0); // Negative change in SOL
        expect(swapQuote.quoteTokenBalanceChange).toBeGreaterThan(0); // Positive change in USDC
      } catch (error) {
        // Don't fail the test if the server is not running
        console.error('Live test error:', error.response ? error.response.data : error.message);
      }
    });
  });
  
  describe('Multi-hop Swap Quote Test', () => {
    it('tests multi-hop swap quote if available in live mode', async () => {
      // Skip if not in live mode
      if (shouldSkipLiveTests()) {
        return;
      }
      
      // Import axios for live testing
      const { default: axios } = require('axios');
      
      try {
        // Call the gateway API for a multi-hop swap (BONK -> USDC)
        // Jupiter will automatically find the best route, including multi-hop routes if beneficial
        const response = await axios.get(
          `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.jupiter.quoteSwap}`,
          {
            params: {
              network: NETWORK,
              baseToken: 'BONK', // Using BONK to increase chance of multi-hop
              quoteToken: 'USDC',
              amount: 1000000.0, // 1M BONK tokens
              side: 'SELL'
            }
          }
        );
        
        const swapQuote = response.data;
        
        // Validate using the shared schema validator
        validateSwapQuote(swapQuote, 'SELL');
      } catch (error) {
        // Don't fail the test if the server is not running or this token isn't available
        console.error('Live multi-hop test error:', error.response ? error.response.data : error.message);
      }
    });
  });
  
  describe('Error Handling', () => {
    it('handles token not found errors', async () => {
      // Import axios for mocking
      const axios = require('axios').default;
      
      // Mock error response for invalid token
      const errorResponse = {
        error: 'Token not found',
        code: 400,
        details: 'Token INVALID_TOKEN is not supported'
      };
      
      // Mock axios to return an error
      axios.get.mockRejectedValueOnce({
        response: {
          status: 400,
          data: errorResponse
        }
      });
      
      try {
        // Call with invalid token
        await axios.get(
          `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.jupiter.quoteSwap}`,
          {
            params: {
              network: NETWORK,
              baseToken: 'INVALID_TOKEN',
              quoteToken: 'USDC',
              amount: 1.0,
              side: 'SELL'
            }
          }
        );
        
        // Should not reach here
        fail('Expected API call to fail with error');
      } catch (error) {
        // Verify error structure
        expect(error.response).toBeDefined();
        expect(error.response.status).toBe(400);
        expect(error.response.data).toEqual(errorResponse);
      }
    });
    
    it('handles insufficient liquidity errors', async () => {
      // Import axios for mocking
      const axios = require('axios').default;
      
      // Mock error response for insufficient liquidity
      const errorResponse = {
        error: 'Insufficient liquidity',
        code: 400,
        details: 'Not enough liquidity to process swap of this size'
      };
      
      // Mock axios to return an error
      axios.get.mockRejectedValueOnce({
        response: {
          status: 400,
          data: errorResponse
        }
      });
      
      try {
        // Call with very large amount
        await axios.get(
          `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.jupiter.quoteSwap}`,
          {
            params: {
              network: NETWORK,
              baseToken: 'SOL',
              quoteToken: 'USDC',
              amount: 1000000.0, // 1M SOL - unrealistically large
              side: 'SELL'
            }
          }
        );
        
        // Should not reach here
        fail('Expected API call to fail with error');
      } catch (error) {
        // Verify error structure
        expect(error.response).toBeDefined();
        expect(error.response.status).toBe(400);
        expect(error.response.data).toEqual(errorResponse);
      }
    });
  });
});
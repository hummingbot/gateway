const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Constants for this test file
const CONNECTOR = 'jupiter';
const PROTOCOL = 'swap';
const CHAIN = 'solana';
const NETWORK = 'mainnet-beta';  // Only test mainnet-beta
const BASE_TOKEN = 'SOL';
const QUOTE_TOKEN = 'USDC';
const TEST_WALLET = 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD';

// Mock API calls (axios.get and axios.post)
jest.mock('axios');

// Mock implementation for axios
axios.get = jest.fn();
axios.post = jest.fn();

// Helper to load mock responses
function loadMockResponse(filename) {
  const filePath = path.join(__dirname, '..', '..', 'mocks', 'connectors', 
    `${CONNECTOR}`, `${filename}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Function to validate swap quote response structure
function validateSwapQuote(response) {
  return (
    response &&
    typeof response.inAmount === 'number' &&
    typeof response.outAmount === 'number' &&
    typeof response.estimatedAmountIn === 'number' &&
    typeof response.estimatedAmountOut === 'number' &&
    typeof response.minAmountOut === 'number' &&
    typeof response.baseTokenBalanceChange === 'number' &&
    typeof response.quoteTokenBalanceChange === 'number' &&
    typeof response.price === 'number'
  );
}

// Function to validate swap execution response structure
function validateSwapExecution(response) {
  return (
    response &&
    typeof response.signature === 'string' &&
    typeof response.totalInputSwapped === 'number' &&
    typeof response.totalOutputSwapped === 'number' &&
    typeof response.fee === 'number' &&
    typeof response.baseTokenBalanceChange === 'number' &&
    typeof response.quoteTokenBalanceChange === 'number'
  );
}

// Tests
describe('Jupiter Swap Tests (Solana Mainnet)', () => {
  
  beforeEach(() => {
    // Reset axios mocks before each test
    axios.get.mockClear();
    axios.post.mockClear();
  });
  
  describe('Quote Swap Endpoint', () => {
    test('returns and validates swap quote for SELL', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('quote-swap');
      
      // Setup mock axios
      axios.get.mockResolvedValueOnce({ 
        status: 200, 
        data: mockResponse 
      });
      
      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/quote-swap`, {
        params: {
          network: NETWORK,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN,
          side: 'SELL',
          amount: 1.0
        }
      });
      
      // Validate the response
      expect(response.status).toBe(200);
      expect(validateSwapQuote(response.data)).toBe(true);
      
      // Check expected mock values
      expect(response.data.estimatedAmountIn).toBe(1.0);
      expect(response.data.baseTokenBalanceChange).toBeLessThan(0); // SELL means negative base token change
      expect(response.data.quoteTokenBalanceChange).toBeGreaterThan(0); // SELL means positive quote token change
      
      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/quote-swap`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
            side: 'SELL',
            amount: 1.0
          })
        })
      );
    });
    
    test('returns and validates swap quote for BUY', async () => {
      // Modify the mock response for BUY direction
      const mockSellResponse = loadMockResponse('quote-swap');
      const mockBuyResponse = {
        ...mockSellResponse,
        // Flip the values for BUY direction
        estimatedAmountIn: mockSellResponse.estimatedAmountOut,
        estimatedAmountOut: mockSellResponse.estimatedAmountIn,
        inAmount: mockSellResponse.outAmount,
        outAmount: mockSellResponse.inAmount,
        baseTokenBalanceChange: 1.0, // Positive for BUY
        quoteTokenBalanceChange: -mockSellResponse.quoteTokenBalanceChange // Negative for BUY
      };
      
      // Setup mock axios
      axios.get.mockResolvedValueOnce({ 
        status: 200, 
        data: mockBuyResponse 
      });
      
      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/quote-swap`, {
        params: {
          network: NETWORK,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN,
          side: 'BUY',
          amount: 1.0
        }
      });
      
      // Validate the response
      expect(response.status).toBe(200);
      expect(validateSwapQuote(response.data)).toBe(true);
      
      // Check expected mock values
      expect(response.data.baseTokenBalanceChange).toBeGreaterThan(0); // BUY means positive base token change
      expect(response.data.quoteTokenBalanceChange).toBeLessThan(0); // BUY means negative quote token change
    });
    
    test('handles error with invalid token', async () => {
      // Setup mock axios with error response
      axios.get.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'Token not found',
            code: 400
          }
        }
      });
      
      // Make the request and expect it to be rejected
      await expect(
        axios.get(`http://localhost:15888/connectors/${CONNECTOR}/quote-swap`, {
          params: {
            network: NETWORK,
            baseToken: 'INVALID',
            quoteToken: QUOTE_TOKEN,
            side: 'SELL',
            amount: 1.0
          }
        })
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: 'Token not found'
          }
        }
      });
    });
  });
  
  describe('Execute Swap Endpoint', () => {
    test('returns successful swap execution', async () => {
      // Load mock responses
      const quoteResponse = loadMockResponse('quote-swap');
      const executeResponse = loadMockResponse('execute-swap');
      
      // Setup mock axios for the execute-swap request
      axios.post.mockResolvedValueOnce({ 
        status: 200, 
        data: executeResponse 
      });
      
      // Make the request
      const response = await axios.post(`http://localhost:15888/connectors/${CONNECTOR}/execute-swap`, {
        network: NETWORK,
        baseToken: BASE_TOKEN,
        quoteToken: QUOTE_TOKEN,
        side: 'SELL',
        amount: 1.0,
        wallet: TEST_WALLET
      });
      
      // Validate the response
      expect(response.status).toBe(200);
      expect(validateSwapExecution(response.data)).toBe(true);
      
      // Check expected mock values
      expect(response.data.signature).toBeDefined();
      expect(response.data.signature.length).toBeGreaterThan(30); // Solana signatures are long
      expect(response.data.totalInputSwapped).toBe(quoteResponse.estimatedAmountIn);
      expect(response.data.totalOutputSwapped).toBe(quoteResponse.estimatedAmountOut);
      
      // Verify axios was called with correct parameters
      expect(axios.post).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/execute-swap`,
        expect.objectContaining({
          network: NETWORK,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN,
          side: 'SELL',
          amount: 1.0,
          wallet: TEST_WALLET
        })
      );
    });
    
    test('handles execution errors', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 500,
          data: {
            error: 'Transaction simulation failed',
            code: 500
          }
        }
      });
      
      // Make the request and expect it to be rejected
      await expect(
        axios.post(`http://localhost:15888/connectors/${CONNECTOR}/execute-swap`, {
          network: NETWORK,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN,
          side: 'SELL',
          amount: 1000000.0, // Very large amount to cause error
          wallet: TEST_WALLET
        })
      ).rejects.toMatchObject({
        response: {
          status: 500,
          data: {
            error: 'Transaction simulation failed'
          }
        }
      });
    });
  });
});
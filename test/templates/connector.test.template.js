/**
 * Template for adding a new connector test
 *
 * Instructions:
 * 1. Copy this file to test/connectors/yourconnector/protocol.test.js
 *    (e.g., test/connectors/pancakeswap/swap.test.js)
 * 2. Replace placeholders with your connector-specific values
 * 3. Create required mock files in test/mocks/connectors/yourconnector/
 * 4. Update validation functions for your connector-specific response formats
 * 5. Add or remove test cases based on your connector's capabilities
 */

const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Constants for this test file - UPDATE THESE FOR YOUR CONNECTOR
const CONNECTOR = 'yourconnector'; // Connector name used in API paths
const PROTOCOL = 'yourprotocol'; // Protocol type (swap, amm, clmm)
const CHAIN = 'yourchain'; // Chain this connector operates on
const NETWORK = 'yournetwork'; // Default network to test
const BASE_TOKEN = 'BASE'; // Example base token
const QUOTE_TOKEN = 'QUOTE'; // Example quote token
const TEST_POOL = 'your-pool-address'; // Example pool address (for AMM/CLMM)
const TEST_WALLET = 'your-wallet-address';

// Mock API calls (axios.get and axios.post)
jest.mock('axios');

// Helper to load mock responses
function loadMockResponse(filename) {
  const filePath = path.join(
    __dirname,
    '..',
    'mocks',
    'connectors',
    CONNECTOR,
    `${PROTOCOL}-${filename}.json`,
  );
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// CUSTOMIZE THESE VALIDATION FUNCTIONS FOR YOUR CONNECTOR

// Function to validate pool info response structure (for AMM/CLMM)
function validatePoolInfo(response) {
  return (
    response &&
    typeof response.address === 'string' &&
    typeof response.baseTokenAddress === 'string' &&
    typeof response.quoteTokenAddress === 'string' &&
    typeof response.price === 'number'
    // Add more specific validations for your connector
  );
}

// Function to validate swap quote response structure
function validateSwapQuote(response) {
  return (
    response &&
    typeof response.estimatedAmountIn === 'number' &&
    typeof response.estimatedAmountOut === 'number' &&
    typeof response.price === 'number'
    // Add more specific validations for your connector
  );
}

// Tests
describe(`${CONNECTOR} ${PROTOCOL} Tests (${NETWORK} Network)`, () => {
  beforeEach(() => {
    // Reset axios mocks before each test
    axios.get.mockReset();
    axios.post.mockReset();
  });

  // UNCOMMENT AND CUSTOMIZE THE TEST SECTIONS THAT APPLY TO YOUR CONNECTOR

  /* 
  // For AMM/CLMM connectors: Pool Info tests
  describe('Pool Info Endpoint', () => {
    test('returns and validates pool info', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('pool-info');
      
      // Setup mock axios
      axios.get.mockResolvedValueOnce({ 
        status: 200, 
        data: mockResponse 
      });
      
      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`, {
        params: {
          network: NETWORK,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN
        }
      });
      
      // Validate the response
      expect(response.status).toBe(200);
      expect(validatePoolInfo(response.data)).toBe(true);
      
      // Check expected mock values
      expect(response.data.address).toBe(TEST_POOL);
      
      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN
          })
        })
      );
    });
    
    test('handles error for non-existent pool', async () => {
      // Setup mock axios with error response
      axios.get.mockRejectedValueOnce({
        response: {
          status: 404,
          data: {
            error: 'Pool not found',
            code: 404
          }
        }
      });
      
      // Make the request and expect it to be rejected
      await expect(
        axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`, {
          params: {
            network: NETWORK,
            baseToken: 'UNKNOWN',
            quoteToken: QUOTE_TOKEN
          }
        })
      ).rejects.toMatchObject({
        response: {
          status: 404,
          data: {
            error: 'Pool not found'
          }
        }
      });
    });
  });
  */

  /* 
  // For swap-supporting connectors: Quote Swap tests
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
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-swap`, {
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
      
      // Check expected values based on SELL direction
      expect(response.data.baseTokenBalanceChange).toBeLessThan(0); // SELL means negative base token change
      expect(response.data.quoteTokenBalanceChange).toBeGreaterThan(0); // SELL means positive quote token change
      
      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-swap`,
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
      // Load and modify the mock response for BUY direction
      const mockSellResponse = loadMockResponse('quote-swap');
      const mockBuyResponse = {
        ...mockSellResponse,
        // Flip the values for BUY direction
        baseTokenBalanceChange: Math.abs(mockSellResponse.baseTokenBalanceChange), // Positive for BUY
        quoteTokenBalanceChange: -Math.abs(mockSellResponse.quoteTokenBalanceChange) // Negative for BUY
      };
      
      // Setup mock axios
      axios.get.mockResolvedValueOnce({ 
        status: 200, 
        data: mockBuyResponse 
      });
      
      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-swap`, {
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
  });
  */

  /* 
  // For swap-supporting connectors: Execute Swap tests
  describe('Execute Swap Endpoint', () => {
    test('returns successful swap execution', async () => {
      // Mock a quote-swap response to use as input for execute-swap
      const quoteResponse = loadMockResponse('quote-swap');
      
      // Mock a successful execution response
      const executeResponse = loadMockResponse('execute-swap');
      
      // Setup mock axios for the execute-swap request
      axios.post.mockResolvedValueOnce({ 
        status: 200, 
        data: executeResponse 
      });
      
      // Make the request
      const response = await axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/execute-swap`, {
        network: NETWORK,
        baseToken: BASE_TOKEN,
        quoteToken: QUOTE_TOKEN,
        side: 'SELL',
        amount: 1.0,
        wallet: TEST_WALLET
      });
      
      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      
      // Verify axios was called with correct parameters
      expect(axios.post).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/execute-swap`,
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
  });
  */

  // Add additional connector-specific endpoint tests here
});

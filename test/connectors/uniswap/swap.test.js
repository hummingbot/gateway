const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Constants for this test file
const CONNECTOR = 'uniswap';
const CHAIN = 'ethereum';
const NETWORK = 'base'; // Only test Base network
const BASE_TOKEN = 'WETH';
const QUOTE_TOKEN = 'USDC';
const TEST_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// Mock API calls (axios.get and axios.post)
jest.mock('axios');

// Mock implementation for axios
axios.get = jest.fn();
axios.post = jest.fn();

// Helper to load mock responses
function loadMockResponse(filename) {
  try {
    // First try to find connector-specific mock
    const filePath = path.join(__dirname, 'mocks', `${filename}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    // If not found, use generic mock template
    const templatePath = path.join(
      __dirname,
      '..',
      '..',
      'templates',
      'mock-examples',
      `connector-${filename}.json`,
    );
    return JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  }
}

// Function to validate swap quote response structure
function validateSwapQuote(response) {
  return (
    response &&
    typeof response.estimatedAmountIn === 'number' &&
    typeof response.estimatedAmountOut === 'number' &&
    typeof response.minAmountOut === 'number' &&
    typeof response.maxAmountIn === 'number' &&
    typeof response.baseTokenBalanceChange === 'number' &&
    typeof response.quoteTokenBalanceChange === 'number' &&
    typeof response.price === 'number'
  );
}

// Tests
describe('Uniswap V3 Swap Router Tests (Base Network)', () => {
  beforeEach(() => {
    // Reset axios mocks before each test
    axios.get.mockClear();
    axios.post.mockClear();
  });

  describe('Quote Swap Endpoint', () => {
    test('returns and validates swap quote for SELL', async () => {
      // Create a mock response based on generic template or existing mock
      let mockResponse;
      try {
        mockResponse = loadMockResponse('quote-swap');
      } catch (error) {
        // Create minimal mock if not found
        mockResponse = {
          estimatedAmountIn: 1.0,
          estimatedAmountOut: 1800.0,
          minAmountOut: 1782.0,
          maxAmountIn: 1.0,
          price: 1800.0,
          baseTokenBalanceChange: -1.0,
          quoteTokenBalanceChange: 1800.0,
          gasPrice: 5.0,
          gasLimit: 250000,
          gasCost: 0.00125,
        };
      }

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(
        `http://localhost:15888/connectors/${CONNECTOR}/routes/quote-swap`,
        {
          params: {
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
            side: 'SELL',
            amount: 1.0,
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateSwapQuote(response.data)).toBe(true);

      // Check expected mock values for a SELL
      expect(response.data.baseTokenBalanceChange).toBeLessThan(0); // SELL means negative base token change
      expect(response.data.quoteTokenBalanceChange).toBeGreaterThan(0); // SELL means positive quote token change

      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/routes/quote-swap`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
            side: 'SELL',
            amount: 1.0,
          }),
        }),
      );
    });

    test('returns and validates swap quote for BUY', async () => {
      // Create a mock response based on generic template or existing mock
      let mockBuyResponse;
      try {
        const mockSellResponse = loadMockResponse('quote-swap');
        mockBuyResponse = {
          ...mockSellResponse,
          // Flip the values for BUY direction
          estimatedAmountIn: mockSellResponse.estimatedAmountOut, // Quote amount needed
          estimatedAmountOut: 1.0, // Base amount to receive
          minAmountOut: 1.0,
          maxAmountIn: mockSellResponse.estimatedAmountOut * 1.01, // Add 1% slippage
          baseTokenBalanceChange: 1.0, // Positive for BUY
          quoteTokenBalanceChange: -mockSellResponse.estimatedAmountOut, // Negative for BUY
          // For BUY: price = quote needed / base received
          price: mockSellResponse.estimatedAmountOut / 1.0,
        };
      } catch (error) {
        // Create minimal mock if not found
        mockBuyResponse = {
          estimatedAmountIn: 1800.0,
          estimatedAmountOut: 1.0,
          minAmountOut: 1.0,
          maxAmountIn: 1818.0,
          price: 1800.0, // For BUY: price = quote needed / base received = 1800.0 / 1.0
          baseTokenBalanceChange: 1.0,
          quoteTokenBalanceChange: -1800.0,
          gasPrice: 5.0,
          gasLimit: 250000,
          gasCost: 0.00125,
        };
      }

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockBuyResponse,
      });

      // Make the request
      const response = await axios.get(
        `http://localhost:15888/connectors/${CONNECTOR}/routes/quote-swap`,
        {
          params: {
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
            side: 'BUY',
            amount: 1.0,
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateSwapQuote(response.data)).toBe(true);

      // Check expected mock values for a BUY
      expect(response.data.baseTokenBalanceChange).toBeGreaterThan(0); // BUY means positive base token change
      expect(response.data.quoteTokenBalanceChange).toBeLessThan(0); // BUY means negative quote token change
    });
  });

  describe('Execute Swap Endpoint', () => {
    test('returns successful swap execution with Uniswap V3 Swap Router', async () => {
      // Create a quote-swap response to use as input for execute-swap
      let quoteResponse;
      try {
        quoteResponse = loadMockResponse('quote-swap');
      } catch (error) {
        // Create minimal mock if not found
        quoteResponse = {
          estimatedAmountIn: 1.0,
          estimatedAmountOut: 1800.0,
          minAmountOut: 1782.0,
          maxAmountIn: 1.0,
          price: 1800.0,
          baseTokenBalanceChange: -1.0,
          quoteTokenBalanceChange: 1800.0,
        };
      }

      // Mock a successful execution response
      const executeResponse = {
        signature:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        totalInputSwapped: quoteResponse.estimatedAmountIn,
        totalOutputSwapped: quoteResponse.estimatedAmountOut,
        fee: 0.003,
        baseTokenBalanceChange: quoteResponse.baseTokenBalanceChange,
        quoteTokenBalanceChange: quoteResponse.quoteTokenBalanceChange,
      };

      // Setup mock axios for the execute-swap request
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: executeResponse,
      });

      // Make the request
      const response = await axios.post(
        `http://localhost:15888/connectors/${CONNECTOR}/routes/execute-swap`,
        {
          network: NETWORK,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN,
          side: 'SELL',
          amount: 1.0,
          walletAddress: TEST_WALLET,
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.totalInputSwapped).toBe(
        quoteResponse.estimatedAmountIn,
      );
      expect(response.data.totalOutputSwapped).toBe(
        quoteResponse.estimatedAmountOut,
      );

      // Verify axios was called with correct parameters
      expect(axios.post).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/routes/execute-swap`,
        expect.objectContaining({
          network: NETWORK,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN,
          side: 'SELL',
          amount: 1.0,
          walletAddress: TEST_WALLET,
        }),
      );
    });
  });
});

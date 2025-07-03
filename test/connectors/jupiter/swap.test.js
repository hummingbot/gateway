const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Constants for this test file
const CONNECTOR = 'jupiter';
const NETWORK = 'mainnet-beta'; // Only test mainnet-beta
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
  const filePath = path.join(__dirname, 'mocks', `${filename}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Function to validate swap quote response structure based on GetSwapQuoteResponse schema
function validateSwapQuote(response) {
  return (
    response &&
    typeof response.estimatedAmountIn === 'number' &&
    typeof response.estimatedAmountOut === 'number' &&
    typeof response.minAmountOut === 'number' &&
    typeof response.maxAmountIn === 'number' &&
    typeof response.baseTokenBalanceChange === 'number' &&
    typeof response.quoteTokenBalanceChange === 'number' &&
    typeof response.price === 'number' &&
    typeof response.gasPrice === 'number' &&
    typeof response.gasLimit === 'number' &&
    typeof response.gasCost === 'number'
  );
}

// Function to validate swap execution response structure based on ExecuteSwapResponse schema
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
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(
        `http://localhost:15888/connectors/${CONNECTOR}/quote-swap`,
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
            amount: 1.0,
          }),
        }),
      );
    });

    test('returns and validates swap quote for BUY', async () => {
      // Load BUY mock response
      const mockBuyResponse = loadMockResponse('quote-swap-buy');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockBuyResponse,
      });

      // Make the request
      const response = await axios.get(
        `http://localhost:15888/connectors/${CONNECTOR}/quote-swap`,
        {
          params: {
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
            side: 'BUY',
            amount: 10,
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateSwapQuote(response.data)).toBe(true);

      // Check expected mock values for BUY
      expect(response.data.baseTokenBalanceChange).toBeGreaterThan(0); // BUY means positive base token change
      expect(response.data.quoteTokenBalanceChange).toBeLessThan(0); // BUY means negative quote token change
      expect(response.data.estimatedAmountIn).toBe(10); // Input is USDC amount for BUY
    });

    test('handles error with invalid token', async () => {
      // Setup mock axios with error response
      axios.get.mockRejectedValueOnce({
        response: {
          status: 404,
          data: {
            error: 'NotFound',
            message: 'Token not found: INVALID',
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.get(`http://localhost:15888/connectors/${CONNECTOR}/quote-swap`, {
          params: {
            network: NETWORK,
            baseToken: 'INVALID',
            quoteToken: QUOTE_TOKEN,
            side: 'SELL',
            amount: 1.0,
          },
        }),
      ).rejects.toMatchObject({
        response: {
          status: 404,
          data: {
            error: 'NotFound',
            message: 'Token not found: INVALID',
          },
        },
      });
    });

    test('handles missing required parameters', async () => {
      // Setup mock axios with error response
      axios.get.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: 'Missing required parameter: amount',
          },
        },
      });

      // Make the request without amount
      await expect(
        axios.get(`http://localhost:15888/connectors/${CONNECTOR}/quote-swap`, {
          params: {
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
            side: 'SELL',
            // Missing amount
          },
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
          },
        },
      });
    });

    test('returns quote with custom slippage', async () => {
      // Load mock response for custom slippage
      const mockResponse = loadMockResponse('quote-swap-slippage');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request with custom slippage
      const response = await axios.get(
        `http://localhost:15888/connectors/${CONNECTOR}/quote-swap`,
        {
          params: {
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
            side: 'SELL',
            amount: 0.1,
            slippagePct: 2.5, // 2.5% slippage
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateSwapQuote(response.data)).toBe(true);

      // With higher slippage, minAmountOut should be lower than the estimated output
      expect(response.data.minAmountOut).toBeLessThan(
        response.data.estimatedAmountOut,
      );
      expect(response.data.minAmountOut).toBeCloseTo(15.98, 1); // ~2.5% less than 16.39

      // Verify axios was called with slippage parameter
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/quote-swap`,
        expect.objectContaining({
          params: expect.objectContaining({
            slippagePct: 2.5,
          }),
        }),
      );
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
        data: executeResponse,
      });

      // Make the request
      const response = await axios.post(
        `http://localhost:15888/connectors/${CONNECTOR}/execute-swap`,
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
      expect(validateSwapExecution(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.signature).toBeDefined();
      expect(response.data.signature.length).toBeGreaterThan(30); // Solana signatures are long
      expect(response.data.totalInputSwapped).toBeCloseTo(
        quoteResponse.estimatedAmountIn,
        3, // Allow some difference due to fees
      );
      expect(response.data.totalOutputSwapped).toBeCloseTo(
        quoteResponse.estimatedAmountOut,
        3,
      );

      // Verify axios was called with correct parameters
      expect(axios.post).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/execute-swap`,
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

    test('handles execution errors', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 500,
          data: {
            error: 'Transaction simulation failed',
            code: 500,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.post(
          `http://localhost:15888/connectors/${CONNECTOR}/execute-swap`,
          {
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
            side: 'SELL',
            amount: 1000000.0, // Very large amount to cause error
            walletAddress: TEST_WALLET,
          },
        ),
      ).rejects.toMatchObject({
        response: {
          status: 500,
          data: {
            error: 'Transaction simulation failed',
          },
        },
      });
    });
  });
});

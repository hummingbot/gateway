const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Constants for this test file
const CONNECTOR = 'pumpswap';
const PROTOCOL = 'amm';
const NETWORK = 'mainnet-beta';
const BASE_TOKEN = 'SOL';
const QUOTE_TOKEN = 'USDC';
const TEST_POOL = '9XaViBVok9Td3kXCwWbRyJzETsnP2HoV8rDiQet3CreW'; // PumpSwap AMM pool
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

// Function to validate pool info response structure
function validatePoolInfo(response) {
  return (
    response &&
    typeof response.address === 'string' &&
    typeof response.baseTokenAddress === 'string' &&
    typeof response.quoteTokenAddress === 'string' &&
    typeof response.feePct === 'number' &&
    typeof response.price === 'number' &&
    typeof response.baseTokenAmount === 'number' &&
    typeof response.quoteTokenAmount === 'number'
  );
}

// Function to validate swap quote response structure based on QuoteSwapResponse schema
function validateSwapQuote(response) {
  return (
    response &&
    typeof response.poolAddress === 'string' &&
    typeof response.tokenIn === 'string' &&
    typeof response.tokenOut === 'string' &&
    typeof response.amountIn === 'number' &&
    typeof response.amountOut === 'number' &&
    typeof response.price === 'number' &&
    typeof response.minAmountOut === 'number' &&
    typeof response.maxAmountIn === 'number' &&
    typeof response.priceImpactPct === 'number'
  );
}

// Function to validate swap execution response structure
function validateSwapExecution(response) {
  return (
    response &&
    typeof response.signature === 'string' &&
    typeof response.status === 'number' && // Added status field
    (response.status !== 1 || // If not CONFIRMED
      (response.data && // then data is optional
        typeof response.data.tokenIn === 'string' &&
        typeof response.data.tokenOut === 'string' &&
        typeof response.data.amountIn === 'number' &&
        typeof response.data.amountOut === 'number' &&
        typeof response.data.fee === 'number' &&
        typeof response.data.baseTokenBalanceChange === 'number' &&
        typeof response.data.quoteTokenBalanceChange === 'number'))
  );
}

// Function to validate liquidity quote response
function validateLiquidityQuote(response) {
  return (
    response &&
    typeof response.baseLimited === 'boolean' &&
    typeof response.baseTokenAmount === 'number' &&
    typeof response.quoteTokenAmount === 'number' &&
    typeof response.baseTokenAmountMax === 'number' &&
    typeof response.quoteTokenAmountMax === 'number'
  );
}

// Function to validate position info response
function validatePositionInfo(response) {
  return (
    response &&
    typeof response.poolAddress === 'string' &&
    typeof response.walletAddress === 'string' &&
    typeof response.baseTokenAddress === 'string' &&
    typeof response.quoteTokenAddress === 'string' &&
    typeof response.lpTokenAmount === 'number' &&
    typeof response.baseTokenAmount === 'number' &&
    typeof response.quoteTokenAmount === 'number' &&
    typeof response.price === 'number'
  );
}

// Tests
describe('PumpSwap AMM Tests (Solana Mainnet)', () => {
  beforeEach(() => {
    // Reset axios mocks before each test
    axios.get.mockClear();
    axios.post.mockClear();
  });

  describe('Pool Info Endpoint', () => {
    test('returns and validates pool info', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('amm-pool-info');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`, {
        params: {
          network: NETWORK,
          poolAddress: TEST_POOL,
        },
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(validatePoolInfo(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.address).toBe(TEST_POOL);
      expect(response.data.feePct).toBeGreaterThan(0);

      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
            poolAddress: TEST_POOL,
          }),
        }),
      );
    });

    test('handles error for non-existent pool', async () => {
      // Setup mock axios with error response
      axios.get.mockRejectedValueOnce({
        response: {
          status: 404,
          data: {
            error: 'NotFound',
            message: 'Pool account not found',
            code: 404,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`, {
          params: {
            network: NETWORK,
            poolAddress: '11111111111111111111111111111111',
          },
        }),
      ).rejects.toMatchObject({
        response: {
          status: 404,
          data: {
            error: 'NotFound',
          },
        },
      });
    });
  });

  describe('Quote Swap Endpoint', () => {
    test('returns and validates swap quote for SELL', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('swap-quote');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-swap`, {
        params: {
          network: NETWORK,
          poolAddress: TEST_POOL,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN,
          side: 'SELL',
          amount: 1.0,
        },
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateSwapQuote(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.poolAddress).toBe(TEST_POOL);
      expect(response.data.amountIn).toBeGreaterThan(0);
      expect(response.data.amountOut).toBeGreaterThan(0);

      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-swap`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
            poolAddress: TEST_POOL,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
            side: 'SELL',
            amount: 1.0,
          }),
        }),
      );
    });

    test('returns and validates swap quote for BUY', async () => {
      // Modify the mock response for BUY direction
      const mockSellResponse = loadMockResponse('swap-quote');
      const mockBuyResponse = {
        ...mockSellResponse,
        // Flip the values for BUY direction
        amountIn: mockSellResponse.amountOut,
        amountOut: mockSellResponse.amountIn,
        maxAmountIn: mockSellResponse.amountOut * 1.01, // with slippage
        minAmountOut: mockSellResponse.amountIn * 0.99, // with slippage
        price: mockSellResponse.amountOut / mockSellResponse.amountIn,
      };

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockBuyResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-swap`, {
        params: {
          network: NETWORK,
          poolAddress: TEST_POOL,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN,
          side: 'BUY',
          amount: 1.0,
        },
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateSwapQuote(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.poolAddress).toBe(TEST_POOL);
      expect(response.data.amountIn).toBeGreaterThan(0);
      expect(response.data.amountOut).toBeGreaterThan(0);
    });

    test('handles insufficient liquidity error', async () => {
      // Setup mock axios with error response
      axios.get.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: 'Insufficient liquidity in pool',
            code: 400,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-swap`, {
          params: {
            network: NETWORK,
            poolAddress: TEST_POOL,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
            side: 'SELL',
            amount: 1000000.0, // Very large amount
          },
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: expect.stringContaining('Insufficient liquidity'),
          },
        },
      });
    });
  });

  describe('Execute Swap Endpoint', () => {
    test('returns successful swap execution', async () => {
      // Load mock response
      const executeResponse = loadMockResponse('swap-execute');

      // Setup mock axios for the execute-swap request
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: executeResponse,
      });

      // Make the request
      const response = await axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/execute-swap`, {
        network: NETWORK,
        poolAddress: TEST_POOL,
        baseToken: BASE_TOKEN,
        quoteToken: QUOTE_TOKEN,
        side: 'SELL',
        amount: 1.0,
        walletAddress: TEST_WALLET,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateSwapExecution(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.signature).toBeDefined();
      expect(response.data.signature.length).toBeGreaterThan(80); // Solana signatures are long
      expect(response.data.status).toBe(1); // CONFIRMED
      expect(response.data.data.fee).toBeGreaterThan(0);
    });

    test('handles transaction simulation error', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 500,
          data: {
            error: 'InternalServerError',
            message: 'Transaction simulation failed',
            code: 500,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/execute-swap`, {
          network: NETWORK,
          poolAddress: TEST_POOL,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN,
          side: 'SELL',
          amount: 1000000.0,
          walletAddress: TEST_WALLET,
        }),
      ).rejects.toMatchObject({
        response: {
          status: 500,
          data: {
            error: 'InternalServerError',
          },
        },
      });
    });
  });

  describe('Quote Liquidity Endpoint', () => {
    test('returns and validates liquidity quote', async () => {
      const mockResponse = loadMockResponse('amm-quote-liquidity');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-liquidity`, {
        params: {
          network: NETWORK,
          poolAddress: TEST_POOL,
          baseTokenAmount: 1.0,
          quoteTokenAmount: 167.5,
        },
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateLiquidityQuote(response.data)).toBe(true);
      expect(response.data.baseTokenAmount).toBeGreaterThan(0);
      expect(response.data.quoteTokenAmount).toBeGreaterThan(0);
    });
  });

  describe('Position Info Endpoint', () => {
    test('returns and validates position info', async () => {
      const mockResponse = loadMockResponse('amm-position-info');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/position-info`, {
        params: {
          network: NETWORK,
          poolAddress: TEST_POOL,
          walletAddress: TEST_WALLET,
        },
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(validatePositionInfo(response.data)).toBe(true);
      expect(response.data.poolAddress).toBe(TEST_POOL);
      expect(response.data.walletAddress).toBe(TEST_WALLET);
    });
  });

  describe('Add Liquidity Endpoint', () => {
    test('returns successful liquidity addition', async () => {
      const mockResponse = loadMockResponse('amm-add-liquidity');

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/add-liquidity`, {
        network: NETWORK,
        poolAddress: TEST_POOL,
        baseTokenAmount: 1.0,
        quoteTokenAmount: 167.5,
        walletAddress: TEST_WALLET,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.status).toBe(1); // CONFIRMED
      expect(response.data.data.baseTokenAmountAdded).toBeGreaterThan(0);
      expect(response.data.data.quoteTokenAmountAdded).toBeGreaterThan(0);
    });

    test('handles insufficient balance error', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: 'Insufficient balance for SOL',
            code: 400,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/add-liquidity`, {
          network: NETWORK,
          poolAddress: TEST_POOL,
          baseTokenAmount: 10000.0, // Large amount
          quoteTokenAmount: 1675000.0,
          walletAddress: TEST_WALLET,
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: expect.stringContaining('Insufficient balance'),
          },
        },
      });
    });
  });

  describe('Remove Liquidity Endpoint', () => {
    test('returns successful liquidity removal', async () => {
      const mockResponse = loadMockResponse('amm-remove-liquidity');

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/remove-liquidity`, {
        network: NETWORK,
        poolAddress: TEST_POOL,
        percentageToRemove: 50,
        walletAddress: TEST_WALLET,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.status).toBe(1); // CONFIRMED
      expect(response.data.data.baseTokenAmountRemoved).toBeGreaterThan(0);
      expect(response.data.data.quoteTokenAmountRemoved).toBeGreaterThan(0);
    });

    test('handles insufficient LP token balance error', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: 'Insufficient LP token balance',
            code: 400,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/remove-liquidity`, {
          network: NETWORK,
          poolAddress: TEST_POOL,
          percentageToRemove: 100,
          walletAddress: TEST_WALLET,
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: expect.stringContaining('Insufficient LP token balance'),
          },
        },
      });
    });
  });
});
